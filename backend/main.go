// main.go
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/subtle"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/marcboeker/go-duckdb"
	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/singleflight"
)

type Config struct {
	DBPath        string
	StaticDir     string
	Threads       int
	MetadataGlob  string
	AdminToken    string
	TempDir       string
	MaxTempGiB    int
	MemoryLimitGB int
	Host          string
	Port          int
	CORSOrigins   []string
}

func loadConfig() (*Config, error) {
	_ = godotenv.Load()
	get := func(k, def string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return def
	}
	cfg := &Config{}
	// Use relative Linux-friendly defaults. Railway can override DUCKDB_PATH
	// with a persistent-volume path such as /data/zdnadatabase.duckdb.
	cfg.DBPath = get("DUCKDB_PATH", "data/zdnadatabase.duckdb")
	cfg.StaticDir = get("STATIC_DIR", "frontend/dist")
	// Full release metadata (all assemblies, incl. those with 0 predictions).
	// The DuckDB metadata table only holds assemblies with predictions.
	cfg.MetadataGlob = get("METADATA_GLOB", "data/metadata.tsv.gz")
	cfg.AdminToken = get("ADMIN_TOKEN", "")
	cfg.TempDir = get("DUCKDB_TEMP_DIR", "data/tmp")
	if p, err := strconv.Atoi(get("DUCKDB_MAX_TEMP_GIB", "50")); err == nil {
		cfg.MaxTempGiB = p
	} else {
		cfg.MaxTempGiB = 50
	}
	if p, err := strconv.Atoi(get("DUCKDB_MEMORY_LIMIT_GB", "4")); err == nil {
		cfg.MemoryLimitGB = p
	} else {
		cfg.MemoryLimitGB = 4
	}
	cfg.Host = get("HOST", "0.0.0.0")
	if p, err := strconv.Atoi(get("PORT", "8080")); err == nil {
		cfg.Port = p
	} else {
		cfg.Port = 8080
	}
	if t, err := strconv.Atoi(get("DUCKDB_THREADS", "6")); err == nil {
		cfg.Threads = t
	} else {
		cfg.Threads = 6
	}
	origins := get("CORS_ORIGIN", "http://localhost:5173,http://localhost:3000")
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.CORSOrigins = append(cfg.CORSOrigins, o)
		}
	}
	return cfg, nil
}

func normalizePath(p string) string { return strings.ReplaceAll(p, "\\", "/") }
func sqlQuote(s string) string      { return strings.ReplaceAll(s, "'", "''") }
func quoteIdent(id string) string   { return `"` + strings.ReplaceAll(id, `"`, `""`) + `"` }

type Server struct {
	cfg   *Config
	db    *sql.DB
	dbErr error
}

// openDuckDB opens an in-memory DuckDB, attaches the release file read-only as
// "zdb" and exposes its objects under their usual names, except metadata, which
// is loaded from the full release TSV (see loadReleaseMetadata).
func openDuckDB(cfg *Config) (*sql.DB, error) {
	dsn := fmt.Sprintf("?threads=%d", cfg.Threads)
	db, err := sql.Open("duckdb", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	db.SetMaxIdleConns(4) // keep warm connections for parallel queries
	// optional pragmas
	td := normalizePath(cfg.TempDir)
	_ = os.MkdirAll(filepath.FromSlash(td), 0o755)
	db.Exec("PRAGMA threads = " + strconv.Itoa(cfg.Threads))
	db.Exec(fmt.Sprintf("PRAGMA temp_directory = '%s'", sqlQuote(td)))
	db.Exec(fmt.Sprintf("PRAGMA max_temp_directory_size = '%dGB'", cfg.MaxTempGiB))
	db.Exec(fmt.Sprintf("PRAGMA memory_limit = '%dGB'", cfg.MemoryLimitGB))

	if _, err := db.Exec(fmt.Sprintf("ATTACH '%s' AS zdb (READ_ONLY)", sqlQuote(normalizePath(cfg.DBPath)))); err != nil {
		db.Close()
		return nil, err
	}
	rows, err := db.Query(`
		SELECT table_name FROM duckdb_tables() WHERE database_name = 'zdb' AND schema_name = 'main'
		UNION ALL
		SELECT view_name FROM duckdb_views() WHERE database_name = 'zdb' AND schema_name = 'main' AND NOT internal`)
	if err != nil {
		db.Close()
		return nil, err
	}
	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			db.Close()
			return nil, err
		}
		names = append(names, n)
	}
	rows.Close()
	for _, n := range names {
		// metadata comes from the TSV; zdna is recreated over the data view below.
		if n == "metadata" || n == "metadata_view" || n == "zdna" {
			continue
		}
		src := "SELECT * FROM zdb.main." + quoteIdent(n)
		if n == "data" {
			src = `SELECT * REPLACE (` + chromosomeDisplaySQL + ` AS "Chromosome") FROM zdb.main.data`
		}
		if _, err := db.Exec(fmt.Sprintf("CREATE VIEW %s AS %s", quoteIdent(n), src)); err != nil {
			db.Close()
			return nil, err
		}
	}
	if err := loadReleaseMetadata(db, cfg); err != nil {
		db.Close()
		return nil, fmt.Errorf("loading metadata from %s: %w", cfg.MetadataGlob, err)
	}
	if err := lockDownEngine(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// lockDownEngine runs once all files are loaded. Queries (including those sent to the
// public /api/sql endpoint) can then no longer read or write files or the network, and
// lock_configuration stops a query from switching that back on.
func lockDownEngine(db *sql.DB) error {
	for _, stmt := range []string{"SET enable_external_access = false", "SET lock_configuration = true"} {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("%s: %w", stmt, err)
		}
	}
	return nil
}

// UCSC-style names for the human T2T assembly's chromosomes (NCBI RefSeq -> 1..22, X, Y).
// Only this assembly is renamed; every other assembly keeps its sequence accessions.
const humanT2TAssembly = "GCF_009914755.1"

var humanT2TChromosomes = [][2]string{
	{"NC_060925.1", "1"}, {"NC_060926.1", "2"}, {"NC_060927.1", "3"}, {"NC_060928.1", "4"},
	{"NC_060929.1", "5"}, {"NC_060930.1", "6"}, {"NC_060931.1", "7"}, {"NC_060932.1", "8"},
	{"NC_060933.1", "9"}, {"NC_060934.1", "10"}, {"NC_060935.1", "11"}, {"NC_060936.1", "12"},
	{"NC_060937.1", "13"}, {"NC_060938.1", "14"}, {"NC_060939.1", "15"}, {"NC_060940.1", "16"},
	{"NC_060941.1", "17"}, {"NC_060942.1", "18"}, {"NC_060943.1", "19"}, {"NC_060944.1", "20"},
	{"NC_060945.1", "21"}, {"NC_060946.1", "22"}, {"NC_060947.1", "X"}, {"NC_060948.1", "Y"},
}

// chromosomeDisplaySQL is the "Chromosome" expression of the data view.
var chromosomeDisplaySQL = func() string {
	var b strings.Builder
	b.WriteString(`CASE WHEN assembly = '` + humanT2TAssembly + `' THEN CASE "Chromosome"`)
	for _, m := range humanT2TChromosomes {
		b.WriteString(fmt.Sprintf(" WHEN '%s' THEN '%s'", m[0], m[1]))
	}
	b.WriteString(` ELSE "Chromosome" END ELSE "Chromosome" END`)
	return b.String()
}()

// loadReleaseMetadata builds the in-memory metadata table from the release TSV,
// with the same TSV->DB column mapping as scripts/migrate/release.py, but keeping
// assemblies without predictions (0 is a valid density). T2T status and has_gff
// are intentionally not part of the metadata.
func loadReleaseMetadata(db *sql.DB, cfg *Config) error {
	t := func(c string) string { return fmt.Sprintf("nullif(m.%s,'')", c) }
	na := func(c string) string { return fmt.Sprintf("nullif(nullif(m.%s,''),'na')", c) }
	big := func(c string) string { return fmt.Sprintf("TRY_CAST(m.%s AS BIGINT)", c) }
	_, err := db.Exec(`
	CREATE TABLE metadata AS
	SELECT
		m.assembly_accession                      AS assembly,
		` + big("ncbi_summary_taxid") + `         AS taxid,
		CASE m.resolve_level WHEN 'complete' THEN 'Complete Genome'
		                     WHEN 'chromosome' THEN 'Chromosome'
		                     ELSE ` + t("resolve_level") + ` END AS assembly_level,
		TRY_CAST(m.gc_percent AS DOUBLE)          AS gc_percent,
		` + t("superkingdom") + `                 AS superkingdom,
		` + t("kingdom") + `                      AS kingdom,
		` + t("phylum") + `                       AS phylum,
		` + t("class") + `                        AS class,
		` + t(`"order"`) + `                      AS "order",
		` + t("family") + `                       AS family,
		` + t("genus") + `                        AS genus,
		` + t("tax_name") + `                     AS tax_name,
		` + t("viral_realm") + `                  AS viral_realm,
		` + t("updated_tax_name") + `             AS updated_tax_name,
		` + big("total_z_bases") + `              AS obs_zbp,
		-- TSV z_density is a fraction (total_z_bases / genome_size_manual); app shows per kb
		TRY_CAST(m.z_density AS DOUBLE) * 1000    AS obs_density_per_kb,
		` + big("z_predictions_count") + `        AS obs_n_zdna,
		` + big("ncbi_summary_species_taxid") + ` AS species_taxid,
		` + t("organism_name") + `                AS organism_name,
		` + t("species") + `                      AS species,
		` + na("infraspecific_name") + `          AS infraspecific_name,
		` + big("genome_size_ungapped") + `       AS genome_size_ungapped,
		` + big("genome_size_manual") + `         AS genome_size_manual,
		` + big("replicon_count") + `             AS replicon_count,
		` + big("scaffold_count") + `             AS scaffold_count,
		` + big("contig_count") + `               AS contig_count,
		TRY_CAST(m.reference_genome AS BOOLEAN)   AS reference_genome,
		` + na("paired_asm_comp") + `             AS paired_asm_comp
	FROM read_csv('` + sqlQuote(normalizePath(cfg.MetadataGlob)) + `', delim='\t', header=true, all_varchar=true) m
	ORDER BY m.assembly_accession`)
	return err
}

func (s *Server) createOrReplaceViews() error {
	var cnt int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name)='zdna' AND table_catalog=current_database()`).Scan(&cnt)
	if cnt > 0 {
		return nil
	}
	var hasData int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name)='data' AND table_catalog=current_database()`).Scan(&hasData)
	if hasData > 0 {
		_, err := s.db.Exec(`
CREATE OR REPLACE VIEW zdna AS
SELECT "Chromosome","Start","End","Z-DNA Score","Sequence", "assembly" AS "Assembly" FROM data`)
		return err
	}
	return nil
}

// ---------- home insights: single cached endpoint ----------

// Every input (the release DuckDB file and metadata TSV) is fixed for the life of
// the process, so the insights payload is computed once (warmed at startup) and
// then served from memory.
var (
	insightsMu      sync.Mutex
	insightsPayload []byte
	insightsFlight  singleflight.Group
)

// Top kingdoms by species-taxid-balanced mean density: assembly densities
// (0 for assemblies without predictions) are averaged per species taxid, then
// those means are averaged per kingdom. Unclassified kingdoms are excluded.
const homeTopKingdomsQuery = `
	WITH per_taxid AS (
		SELECT
			kingdom,
			species_taxid,
			AVG(TRY_CAST(obs_density_per_kb AS DOUBLE)) AS taxid_density,
			COUNT(*) AS assembly_count,
			COALESCE(MAX(superkingdom), '(unknown)') AS superkingdom
		FROM metadata
		WHERE kingdom IS NOT NULL AND kingdom <> ''
		  AND kingdom NOT ILIKE '%unclassified%'
		  AND species_taxid IS NOT NULL
		  AND obs_density_per_kb IS NOT NULL
		  AND genome_size_manual >= 1000
		GROUP BY kingdom, species_taxid
	)
	SELECT
		kingdom AS label,
		AVG(taxid_density) AS density,
		SUM(assembly_count) AS assembly_count,
		COUNT(*) AS unique_taxids,
		COALESCE(MAX(superkingdom), '(unknown)') AS superkingdom
	FROM per_taxid
	GROUP BY kingdom
	ORDER BY density DESC
	LIMIT 10`

// Score histogram over a species-taxid-balanced sample: each species taxid
// contributes about scoreSamplePerTaxid predictions (all of them if it has
// fewer). Rows are picked by a hash, so the sample is deterministic.
const scoreSamplePerTaxid = 4

var homeScoreHistogramQuery = fmt.Sprintf(`
	SELECT FLOOR(d."Z-DNA Score"/10)*10 AS bin, COUNT(*) AS n
	FROM data d
	JOIN (
		SELECT assembly, %d.0 / SUM(obs_n_zdna) OVER (PARTITION BY species_taxid) AS rate
		FROM metadata WHERE obs_n_zdna > 0
	) m USING (assembly)
	WHERE (hash(d.assembly, d."Start") %% 1000000) < m.rate * 1000000
	GROUP BY 1 ORDER BY 1`, scoreSamplePerTaxid)

// serveJSON writes JSON with optional gzip. Browsers must not reuse a stored copy:
// the payload is already served from memory, and a stale copy outlives redeploys.
func serveJSON(c *gin.Context, payload []byte) {
	c.Header("Cache-Control", "no-cache")
	if strings.Contains(c.Request.Header.Get("Accept-Encoding"), "gzip") {
		var buf bytes.Buffer
		gz, _ := gzip.NewWriterLevel(&buf, gzip.BestSpeed)
		_, _ = gz.Write(payload)
		_ = gz.Close()
		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		c.Data(http.StatusOK, "application/json; charset=utf-8", buf.Bytes())
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
}

func (s *Server) homeInsights(c *gin.Context) {
	insightsMu.Lock()
	payload := insightsPayload
	insightsMu.Unlock()
	if payload != nil {
		c.Header("X-Cache", "HIT")
		serveJSON(c, payload)
		return
	}
	payload, err := s.loadInsights()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("X-Cache", "MISS")
	serveJSON(c, payload)
}

// loadInsights computes the insights payload once; concurrent callers share the
// in-flight computation. Failures are not cached, so the next request retries.
func (s *Server) loadInsights() ([]byte, error) {
	v, err, _ := insightsFlight.Do("insights", func() (any, error) {
		insightsMu.Lock()
		cached := insightsPayload
		insightsMu.Unlock()
		if cached != nil {
			return cached, nil
		}
		payload, err := s.computeInsights()
		if err != nil {
			log.Println("homeInsights error:", err)
			return nil, err
		}
		insightsMu.Lock()
		insightsPayload = payload
		insightsMu.Unlock()
		return payload, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]byte), nil
}

func (s *Server) computeInsights() ([]byte, error) {
	type KV struct {
		Label  string  `json:"label"`
		N      float64 `json:"n"`
		Taxids int64   `json:"taxids"`
	}
	type TopKV struct {
		Label         string  `json:"label"`
		Density       float64 `json:"density"`
		AssemblyCount int64   `json:"assembly_count"`
		UniqueTaxids  int64   `json:"unique_taxids"`
		Superkingdom  string  `json:"superkingdom"`
	}
	type HistBin struct {
		Bin float64 `json:"bin"`
		N   int64   `json:"n"`
	}
	type KPIs struct {
		TotalAssemblies int64   `json:"total_assemblies"`
		UniqueTaxids    int64   `json:"unique_taxids"`
		AvgGenomeSize   float64 `json:"avg_genome_size"`
		AvgGC           float64 `json:"avg_gc"`
	}
	type InsightsResponse struct {
		KPIs          KPIs      `json:"kpis"`
		Superkingdoms []KV      `json:"superkingdoms"`
		TopKingdoms   []TopKV   `json:"top_kingdoms"`
		Histogram     []HistBin `json:"histogram"`
	}

	var (
		kpis     KPIs
		skRows   []KV
		topRows  []TopKV
		histRows []HistBin
	)

	// Run all queries concurrently — total wall-time ≈ slowest query, not sum.
	var g errgroup.Group

	g.Go(func() error {
		var gs, gc sql.NullFloat64
		var ta, ut sql.NullInt64
		// Genome size and GC are species-taxid-balanced: mean per species taxid,
		// then mean of those means.
		err := s.db.QueryRow(`
			SELECT SUM(n), COUNT(species_taxid), AVG(gs), AVG(gc)
			FROM (
				SELECT species_taxid,
				       COUNT(*) AS n,
				       AVG(TRY_CAST(genome_size_manual AS DOUBLE)) AS gs,
				       AVG(TRY_CAST(gc_percent AS DOUBLE)) AS gc
				FROM metadata
				GROUP BY 1
			) t`).Scan(&ta, &ut, &gs, &gc)
		if err != nil {
			return err
		}
		kpis = KPIs{
			TotalAssemblies: ta.Int64,
			UniqueTaxids:    ut.Int64,
			AvgGenomeSize:   gs.Float64,
			AvgGC:           gc.Float64,
		}
		return nil
	})

	g.Go(func() error {
		rows, err := s.db.Query(`
			SELECT COALESCE(superkingdom,'(unknown)') AS label, COUNT(*) AS n,
			       COUNT(DISTINCT species_taxid) AS taxids
			FROM metadata WHERE genome_size_manual >= 1000
			GROUP BY 1 ORDER BY n DESC`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var kv KV
			var n, t sql.NullInt64
			if err := rows.Scan(&kv.Label, &n, &t); err != nil {
				return err
			}
			kv.N = float64(n.Int64)
			kv.Taxids = t.Int64
			skRows = append(skRows, kv)
		}
		return rows.Err()
	})

	g.Go(func() error {
		rows, err := s.db.Query(homeTopKingdomsQuery)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var t TopKV
			var density sql.NullFloat64
			if err := rows.Scan(
				&t.Label,
				&density,
				&t.AssemblyCount,
				&t.UniqueTaxids,
				&t.Superkingdom,
			); err != nil {
				return err
			}
			t.Density = density.Float64
			topRows = append(topRows, t)
		}
		return rows.Err()
	})

	g.Go(func() error {
		rows, err := s.db.Query(homeScoreHistogramQuery)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var h HistBin
			var bin sql.NullFloat64
			var n sql.NullInt64
			if err := rows.Scan(&bin, &n); err != nil {
				return err
			}
			h.Bin = bin.Float64
			h.N = n.Int64
			histRows = append(histRows, h)
		}
		return rows.Err()
	})

	if err := g.Wait(); err != nil {
		return nil, err
	}

	// Ensure non-null JSON arrays.
	if skRows == nil {
		skRows = []KV{}
	}
	if topRows == nil {
		topRows = []TopKV{}
	}
	if histRows == nil {
		histRows = []HistBin{}
	}

	return json.Marshal(InsightsResponse{
		KPIs:          kpis,
		Superkingdoms: skRows,
		TopKingdoms:   topRows,
		Histogram:     histRows,
	})
}

func rowsToMaps(rows *sql.Rows) ([]map[string]any, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, 128)
	for rows.Next() {
		raw := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range raw {
			ptrs[i] = &raw[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, c := range cols {
			if b, ok := raw[i].([]byte); ok {
				m[c] = string(b)
			} else {
				m[c] = raw[i]
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func getColumnsLimit0(db *sql.DB, table string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("SELECT * FROM %s LIMIT 0", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return rows.Columns()
}

// ---------- health / admin ----------
func (s *Server) health(c *gin.Context) {
	status := "ok"
	response := gin.H{"status": status, "time": time.Now().UTC(), "database_path": s.cfg.DBPath}
	if s.db == nil {
		status = "degraded"
		response["status"] = status
		response["database"] = "unavailable"
		if s.dbErr != nil {
			response["detail"] = s.dbErr.Error()
		}
	} else {
		response["database"] = "available"
	}
	// Keep this endpoint successful when the optional DuckDB file is not mounted.
	// Railway uses a 200 response here to determine that the web service is live.
	c.JSON(http.StatusOK, response)
}

func (s *Server) databaseRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") && c.Request.URL.Path != "/api/health" && s.db == nil {
			response := gin.H{
				"error":         "DuckDB database is unavailable",
				"database_path": s.cfg.DBPath,
			}
			if s.dbErr != nil {
				response["detail"] = s.dbErr.Error()
			}
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, response)
			return
		}
		c.Next()
	}
}

func frontendHandler(staticDir string) gin.HandlerFunc {
	indexPath := filepath.Join(staticDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		log.Printf("Frontend build not found at %s: %v", indexPath, err)
		return func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": "frontend build not found"})
		}
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Status(http.StatusNotFound)
			return
		}
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API route not found"})
			return
		}

		relativePath := strings.TrimPrefix(filepath.Clean(c.Request.URL.Path), string(filepath.Separator))
		if relativePath != "" {
			if info, err := os.Stat(filepath.Join(staticDir, relativePath)); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}
		c.File(indexPath)
	}
}

// adminInit is disabled (404) unless ADMIN_TOKEN is set; callers must then send the
// same value in the X-Admin-Token header.
func (s *Server) adminInit(c *gin.Context) {
	if s.cfg.AdminToken == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin endpoint disabled (set ADMIN_TOKEN to enable)"})
		return
	}
	if subtle.ConstantTimeCompare([]byte(c.GetHeader("X-Admin-Token")), []byte(s.cfg.AdminToken)) != 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid admin token"})
		return
	}
	if err := s.createOrReplaceViews(); err != nil {
		log.Println("adminInit error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "views (re)created"})
}

// ---------- METADATA ----------
func (s *Server) metadataList(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	reqSort := strings.TrimSpace(c.DefaultQuery("sort", ""))
	strings.TrimSpace(c.DefaultQuery("sort", ""))
	dir := strings.ToUpper(strings.TrimSpace(c.Query("dir")))
	if dir != "ASC" && dir != "DESC" {
		dir = "ASC"
	}

	// Use configured columns instead of querying them
	cols := getMetadataColumns()

	// Build SELECT with proper aliases
	selectList := buildMetadataSelect()

	sortCol := "tax_name"
	if reqSort != "" {
		for _, cName := range cols {
			if strings.EqualFold(cName, reqSort) {
				sortCol = cName
				break
			}
		}
	}
	orderBy := ""
	if sortCol == "tax_name" {
		orderBy = fmt.Sprintf(" ORDER BY LOWER(REPLACE(REPLACE(REPLACE(%s, '''', ''), '[', ''), ']', '')) %s", quoteIdent(sortCol), dir)
	} else {
		orderBy = fmt.Sprintf(" ORDER BY %s %s", quoteIdent(sortCol), dir)
	}
	// Accession as tie-breaker: rows with the same sort value (e.g. several assemblies
	// of one species) keep a fixed order, so paging never repeats or skips rows.
	orderBy += ", assembly"

	// Always enforce genome_size_manual >= 1000
	whereParts := []string{metadataBaseFilter}
	args := []any{}

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		// cols holds display labels; search the underlying table columns.
		ors := make([]string, 0, len(metadataColumns))
		for _, col := range metadataColumns {
			ors = append(ors, fmt.Sprintf("LOWER(CAST(%s AS VARCHAR)) LIKE '%%' || LOWER(?) || '%%'", quoteIdent(col.DbName)))
			args = append(args, q)
		}
		whereParts = append(whereParts, "("+strings.Join(ors, " OR ")+")")
	}
	fw, fa := metadataFilters(c)
	whereParts = append(whereParts, fw...)
	args = append(args, fa...)

	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	var total int64
	if err := s.db.QueryRow("SELECT COUNT(*) FROM metadata"+where, args...).Scan(&total); err != nil {
		log.Println("metadataList count error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	q := "SELECT " + selectList + " FROM metadata " + where + orderBy + " LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		log.Println("metadataList data query error:", err, "sql:", q)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := rowsToMaps(rows)
	if err != nil {
		log.Println("metadataList scan error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	respCols, _ := rows.Columns()
	if len(respCols) == 0 {
		respCols = cols
	}
	// When sending response, use the ordered labels
	c.JSON(http.StatusOK, gin.H{
		"columns": cols,
		"rows":    data,
		"limit":   limit,
		"offset":  offset,
		"total":   total,
	})
}

// metadataFilters turns the Species browser filter parameters (taxonomy, exact
// assembly/taxid, ranges) into WHERE clauses with their arguments.
func metadataFilters(c *gin.Context) ([]string, []any) {
	whereParts := []string{}
	args := []any{}
	ciEq := func(col string) string { return fmt.Sprintf("LOWER(%s) = LOWER(?)", quoteIdent(col)) }
	maybeAddTax := func(name string) {
		val := strings.TrimSpace(c.Query(name))
		if val == "" {
			return
		}
		whereParts = append(whereParts, ciEq(name))
		args = append(args, val)
	}
	for _, t := range []string{"superkingdom", "kingdom", "phylum", "class", "order", "family", "genus", "tax_name"} {
		if strings.TrimSpace(c.Query(t)) != "" {
			maybeAddTax(t)
		}
	}
	if v := strings.TrimSpace(c.Query("assembly_eq")); v != "" {
		whereParts = append(whereParts, ciEq("assembly"))
		args = append(args, v)
	}
	if v := strings.TrimSpace(c.Query("taxid_eq")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			whereParts = append(whereParts, "taxid = ?")
			args = append(args, n)
		}
	}

	type rng struct{ col, min, max string }
	for _, r := range []rng{
		{"genome_size_manual", "genome_size_min", "genome_size_max"},
		{"genome_size_ungapped", "genome_size_ungapped_min", "genome_size_ungapped_max"},
		{"gc_percent", "gc_percent_min", "gc_percent_max"},
	} {
		if v := strings.TrimSpace(c.Query(r.min)); v != "" {
			if n, err := strconv.ParseFloat(v, 64); err == nil {
				whereParts = append(whereParts, fmt.Sprintf("%s >= ?", quoteIdent(r.col)))
				args = append(args, n)
			}
		}
		if v := strings.TrimSpace(c.Query(r.max)); v != "" {
			if n, err := strconv.ParseFloat(v, 64); err == nil {
				whereParts = append(whereParts, fmt.Sprintf("%s <= ?", quoteIdent(r.col)))
				args = append(args, n)
			}
		}
	}
	return whereParts, args
}

// metadataCharts serves the Species browser charts over every assembly matching
// the filters, balanced by species taxid like the homepage: values are averaged
// per species taxid first. Genera: top and lowest by mean density (unclassified
// excluded); points: one per species taxid (GC, density, genome size).
func (s *Server) metadataCharts(c *gin.Context) {
	whereParts, args := metadataFilters(c)
	where := " WHERE " + strings.Join(append([]string{metadataBaseFilter}, whereParts...), " AND ")

	edge, _ := strconv.Atoi(c.DefaultQuery("genus_edge", "4"))
	if edge < 1 || edge > 50 {
		edge = 4
	}

	genusSQL := `
		SELECT genus, density, assemblies, taxids, total FROM (
			SELECT genus, AVG(d) AS density, SUM(n) AS assemblies, COUNT(*) AS taxids,
			       COUNT(*) OVER () AS total,
			       ROW_NUMBER() OVER (ORDER BY AVG(d) DESC, genus) AS rank_top,
			       ROW_NUMBER() OVER (ORDER BY AVG(d) ASC, genus DESC) AS rank_low
			FROM (
				SELECT genus, species_taxid, AVG(obs_density_per_kb) AS d, COUNT(*) AS n
				FROM metadata` + where + `
				  AND genus IS NOT NULL AND genus <> '' AND genus NOT ILIKE '%unclassified%'
				  AND species_taxid IS NOT NULL AND obs_density_per_kb IS NOT NULL
				GROUP BY genus, species_taxid
			) t
			GROUP BY genus
		) g
		WHERE total <= ? OR rank_top <= ? OR rank_low <= ?
		ORDER BY density DESC, genus`
	genusArgs := append(append([]any{}, args...), 2*edge, edge, edge)
	rows, err := s.db.Query(genusSQL, genusArgs...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	genera := []gin.H{}
	var generaTotal int64
	for rows.Next() {
		var genus string
		var density float64
		var assemblies, taxids int64
		if err := rows.Scan(&genus, &density, &assemblies, &taxids, &generaTotal); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		genera = append(genera, gin.H{"genus": genus, "density": density, "assemblies": assemblies, "taxids": taxids})
	}
	rows.Close()

	pointSQL := `
		SELECT COALESCE(MAX(superkingdom), '(NA)'), COALESCE(MAX(tax_name), ''), COUNT(*),
		       ROUND(AVG(gc_percent), 2), ROUND(AVG(obs_density_per_kb), 3), ROUND(AVG(genome_size_manual))
		FROM metadata` + where + ` AND species_taxid IS NOT NULL
		GROUP BY species_taxid
		ORDER BY species_taxid`
	rows, err = s.db.Query(pointSQL, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	// Compact rows: [superkingdom, species, assemblies, gc, density, genome size].
	points := [][]any{}
	for rows.Next() {
		var sk, name string
		var n int64
		var gc, den, gsize sql.NullFloat64
		if err := rows.Scan(&sk, &name, &n, &gc, &den, &gsize); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		val := func(v sql.NullFloat64) any {
			if !v.Valid {
				return nil
			}
			return v.Float64
		}
		points = append(points, []any{sk, name, n, val(gc), val(den), val(gsize)})
	}
	c.JSON(http.StatusOK, gin.H{"genera": genera, "genera_total": generaTotal, "points": points})
}

func (s *Server) metadataExport(c *gin.Context) {
	reqSort := strings.TrimSpace(c.DefaultQuery("sort", ""))
	dir := strings.ToUpper(strings.TrimSpace(c.Query("dir")))
	if dir != "ASC" && dir != "DESC" {
		dir = "ASC"
	}

	cols, err := getColumnsLimit0(s.db, "metadata")
	if err != nil || len(cols) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no metadata columns"})
		return
	}

	sortCol := cols[0]
	if reqSort != "" {
		for _, cName := range cols {
			if strings.EqualFold(cName, reqSort) {
				sortCol = cName
				break
			}
		}
	}
	orderBy := fmt.Sprintf(" ORDER BY %s %s", quoteIdent(sortCol), dir)

	whereParts := []string{metadataBaseFilter}
	var args []any

	if q := strings.TrimSpace(c.Query("q")); q != "" {
		maxCols := 10
		if len(cols) < maxCols {
			maxCols = len(cols)
		}
		ors := make([]string, 0, maxCols)
		for i := 0; i < maxCols; i++ {
			ors = append(ors,
				fmt.Sprintf("LOWER(CAST(%s AS VARCHAR)) LIKE '%%' || LOWER(?) || '%%'",
					quoteIdent(cols[i])),
			)
			args = append(args, q)
		}
		whereParts = append(whereParts, "("+strings.Join(ors, " OR ")+")")
	}
	// Same taxonomy / exact / range filters as the Species browser table.
	fw, fa := metadataFilters(c)
	whereParts = append(whereParts, fw...)
	args = append(args, fa...)

	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	lim := 50000
	if s := strings.TrimSpace(c.Query("limit")); s != "" {
		if strings.EqualFold(s, "all") {
			lim = -1
		} else if n, err := strconv.Atoi(s); err == nil {
			lim = n
		}
	}
	selectList := buildMetadataSelect()
	q := "SELECT " + selectList + " FROM metadata" + where + orderBy
	if lim > 0 {
		q += fmt.Sprintf(" LIMIT %d", lim)
	}

	rows, err := s.db.Query(q, args...)
	if err != nil {
		log.Println("metadataExport query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	writeMetadataExport(c, rows, strings.ToLower(strings.TrimSpace(c.DefaultQuery("fmt", "csv"))))
}

// writeMetadataExport streams the exported rows as csv, tsv, json, xml or
// xlsx (an HTML table that Excel opens, saved as .xls). NULLs become empty values.
func writeMetadataExport(c *gin.Context, rows *sql.Rows, format string) {
	header := getMetadataColumns()
	ext, contentType := "csv", "text/csv"
	switch format {
	case "tsv":
		ext, contentType = "tsv", "text/tab-separated-values"
	case "json":
		ext, contentType = "json", "application/json"
	case "xml":
		ext, contentType = "xml", "application/xml"
	case "xlsx", "xls":
		ext, contentType = "xls", "application/vnd.ms-excel"
	default:
		format = "csv"
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", "attachment; filename=metadata_export."+ext)

	// Sized by the SELECT list, not the table: metadata has more columns than are exported.
	vals := make([]any, len(metadataColumns))
	ptrs := make([]any, len(vals))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	next := func() ([]string, []any, bool) {
		if !rows.Next() {
			return nil, nil, false
		}
		if err := rows.Scan(ptrs...); err != nil {
			log.Println("metadataExport scan error:", err)
			return nil, nil, false
		}
		rec := make([]string, len(vals))
		raw := make([]any, len(vals))
		for i, v := range vals {
			switch t := v.(type) {
			case nil:
				rec[i] = ""
			case []byte:
				rec[i] = string(t)
				v = string(t)
			default:
				rec[i] = fmt.Sprint(t)
			}
			raw[i] = v
		}
		return rec, raw, true
	}

	w := c.Writer
	switch format {
	case "json":
		_, _ = w.WriteString("[")
		for first := true; ; first = false {
			_, raw, ok := next()
			if !ok {
				break
			}
			if !first {
				_, _ = w.WriteString(",")
			}
			_, _ = w.WriteString("{")
			for i, h := range header {
				k, _ := json.Marshal(h)
				v, err := json.Marshal(raw[i])
				if err != nil {
					v = []byte("null")
				}
				if i > 0 {
					_, _ = w.WriteString(",")
				}
				_, _ = w.Write(k)
				_, _ = w.WriteString(":")
				_, _ = w.Write(v)
			}
			_, _ = w.WriteString("}")
		}
		_, _ = w.WriteString("]")
	case "xml":
		_, _ = w.WriteString(xml.Header + "<rows>\n")
		for {
			rec, _, ok := next()
			if !ok {
				break
			}
			_, _ = w.WriteString("  <row>")
			for i, h := range header {
				_, _ = w.WriteString(`<field name="`)
				_ = xml.EscapeText(w, []byte(h))
				_, _ = w.WriteString(`">`)
				_ = xml.EscapeText(w, []byte(rec[i]))
				_, _ = w.WriteString("</field>")
			}
			_, _ = w.WriteString("</row>\n")
		}
		_, _ = w.WriteString("</rows>\n")
	case "xlsx", "xls":
		_, _ = w.WriteString(`<html><head><meta charset="utf-8"></head><body><table><tr>`)
		for _, h := range header {
			_, _ = w.WriteString("<th>" + html.EscapeString(h) + "</th>")
		}
		_, _ = w.WriteString("</tr>\n")
		for {
			rec, _, ok := next()
			if !ok {
				break
			}
			_, _ = w.WriteString("<tr>")
			for _, v := range rec {
				_, _ = w.WriteString("<td>" + html.EscapeString(v) + "</td>")
			}
			_, _ = w.WriteString("</tr>\n")
		}
		_, _ = w.WriteString("</table></body></html>")
	default:
		cw := csv.NewWriter(w)
		if format == "tsv" {
			cw.Comma = '\t'
		}
		_ = cw.Write(header)
		for {
			rec, _, ok := next()
			if !ok {
				break
			}
			_ = cw.Write(rec)
		}
		cw.Flush()
	}
}

func (s *Server) metadataTopClasses(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))
	cols, err := getColumnsLimit0(s.db, "metadata")
	if err != nil || len(cols) == 0 {
		c.JSON(http.StatusOK, gin.H{"rows": []any{}, "data": []any{}, "labels": []string{}, "values": []int64{}, "datasets": []gin.H{{"label": "count", "data": []int64{}}}})
		return
	}
	col := ""
	for _, cand := range []string{"class", "kingdom", "phylum", "superkingdom"} {
		for _, cName := range cols {
			if strings.EqualFold(cName, cand) {
				col = cName
				break
			}
		}
		if col != "" {
			break
		}
	}
	if col == "" {
		col = cols[0]
	}

	q := fmt.Sprintf(`SELECT %s AS name, COUNT(*) AS value
					FROM metadata
					WHERE %s
					GROUP BY 1
					ORDER BY value DESC NULLS LAST
					LIMIT ?`,
		quoteIdent(col),
		metadataBaseFilter,
	)

	rows, err := s.db.Query(q, limit)
	if err != nil {
		log.Println("metadataTopClasses query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type pair struct {
		Name  string
		Value int64
	}
	res := []pair{}
	labels := []string{}
	values := []int64{}
	rowsForUI := []gin.H{}
	for rows.Next() {
		var n sql.NullString
		var v sql.NullInt64
		if err := rows.Scan(&n, &v); err != nil {
			continue
		}
		name := n.String
		val := v.Int64
		res = append(res, pair{Name: name, Value: val})
		labels = append(labels, name)
		values = append(values, val)
		rowsForUI = append(rowsForUI, gin.H{"class": name, "n": val})
	}
	c.JSON(http.StatusOK, gin.H{"rows": rowsForUI, "data": res, "labels": labels, "values": values, "datasets": []gin.H{{"label": col, "data": values}}})
}

func (s *Server) metadataDistinct(c *gin.Context) {
	field := strings.TrimSpace(c.Query("field"))
	if field == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing field"})
		return
	}
	allowed := map[string]bool{"superkingdom": true, "kingdom": true, "phylum": true, "class": true, "order": true, "family": true, "genus": true, "tax_name": true, "assembly": true, "taxid": true}
	if !allowed[strings.ToLower(field)] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "field not allowed"})
		return
	}

	whereParts := []string{metadataBaseFilter}
	args := []any{}

	ciEq := func(col string) string { return fmt.Sprintf("LOWER(%s) = LOWER(?)", quoteIdent(col)) }
	maybe := func(name string) {
		v := strings.TrimSpace(c.Query(name))
		if v != "" {
			whereParts = append(whereParts, ciEq(name))
			args = append(args, v)
		}
	}
	for _, t := range []string{"superkingdom", "kingdom", "phylum", "class", "order", "family", "genus", "tax_name"} {
		maybe(t)
	}
	if v := strings.TrimSpace(c.Query("assembly_eq")); v != "" {
		whereParts = append(whereParts, ciEq("assembly"))
		args = append(args, v)
	}
	if v := strings.TrimSpace(c.Query("taxid_eq")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			whereParts = append(whereParts, "taxid = ?")
			args = append(args, n)
		}
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	q := fmt.Sprintf(`SELECT DISTINCT %s AS v FROM metadata %s ORDER BY v NULLS LAST LIMIT 1000`, quoteIdent(field), where)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v sql.NullString
		_ = rows.Scan(&v)
		if v.Valid && strings.TrimSpace(v.String) != "" {
			out = append(out, v.String)
		}
	}
	c.JSON(http.StatusOK, gin.H{"values": out})
}

// ---------- Z‑DNA ----------
// zdnaAssemblyScope returns the assembly accession that the raw Z-DNA endpoints
// (search, export, score histogram) require: without one a request would scan all
// ~2.5 billion predictions. It answers 400 itself when the parameter is missing.
func zdnaAssemblyScope(c *gin.Context) (string, bool) {
	v := strings.TrimSpace(c.Query("assembly_eq"))
	if v == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "assembly_eq (an assembly accession) is required"})
		return "", false
	}
	return v, true
}

func (s *Server) zdnaSearch(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	sortKey := strings.TrimSpace(c.Query("sort"))
	order := strings.ToUpper(c.DefaultQuery("order", "ASC"))
	if order != "ASC" && order != "DESC" {
		order = "ASC"
	}
	sortMap := map[string]string{"chrom": "Chromosome", "start": "Start", "end": "End", "score": "Z-DNA Score"}
	sortCol := ""
	if sortKey != "" && sortKey != "none" {
		if v, ok := sortMap[sortKey]; ok {
			sortCol = v
		}
	}

	assembly, ok := zdnaAssemblyScope(c)
	if !ok {
		return
	}
	whereParts := []string{`"assembly" = ?`}
	args := []any{assembly}
	if v := strings.TrimSpace(c.Query("chr")); v != "" {
		whereParts = append(whereParts, `"Chromosome" = ?`)
		args = append(args, v)
	}
	if v := c.Query("start_gte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Start" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("end_lte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"End" <= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_min"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_max"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" <= ?`)
			args = append(args, n)
		}
	}
	if v := strings.TrimSpace(c.Query("seq")); v != "" {
		whereParts = append(whereParts, `LOWER("Sequence") LIKE '%' || LOWER(?) || '%'`)
		args = append(args, v)
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	fast := strings.TrimSpace(c.DefaultQuery("fast", "1")) == "1"
	var total int64 = -1
	if !fast {
		if err := s.db.QueryRowContext(c.Request.Context(), "SELECT COUNT(*) FROM data"+where, args...).Scan(&total); err != nil {
			log.Println("zdnaSearch count error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	selectList := `"Chromosome","Start","End","Z-DNA Score","Sequence"`
	orderBy := ""
	if sortCol != "" {
		orderBy = fmt.Sprintf(` ORDER BY "%s" %s`, sortCol, order)
	}
	q := "SELECT " + selectList + " FROM data" + where + orderBy + " LIMIT ? OFFSET ?"
	args2 := append([]any{}, args...)
	args2 = append(args2, limit, offset)
	rows, err := s.db.QueryContext(c.Request.Context(), q, args2...)
	if err != nil {
		log.Println("zdnaSearch data query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := rowsToMaps(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"columns": []string{"Chromosome", "Start", "End", "Z-DNA Score", "Sequence"}, "rows": data, "limit": limit, "offset": offset, "total": total})
}

func (s *Server) zdnaExport(c *gin.Context) {
	sortKey := strings.TrimSpace(c.Query("sort"))
	order := strings.ToUpper(c.DefaultQuery("order", "ASC"))
	if order != "ASC" && order != "DESC" {
		order = "ASC"
	}
	sortMap := map[string]string{"chrom": "Chromosome", "start": "Start", "end": "End", "score": "Z-DNA Score"}
	sortCol := ""
	if sortKey != "" && sortKey != "none" {
		if v, ok := sortMap[sortKey]; ok {
			sortCol = v
		}
	}

	lim := 100000
	if s := strings.TrimSpace(c.Query("limit")); s != "" {
		if strings.EqualFold(s, "all") {
			lim = -1
		} else if n, err := strconv.Atoi(s); err == nil {
			lim = n
		}
	}
	off := 0
	if s := strings.TrimSpace(c.Query("offset")); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			off = n
		}
	}

	assembly, ok := zdnaAssemblyScope(c)
	if !ok {
		return
	}
	whereParts := []string{`"assembly" = ?`}
	args := []any{assembly}
	if v := strings.TrimSpace(c.Query("chr")); v != "" {
		whereParts = append(whereParts, `"Chromosome" = ?`)
		args = append(args, v)
	}
	if v := c.Query("start_gte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Start" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("end_lte"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"End" <= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_min"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_max"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" <= ?`)
			args = append(args, n)
		}
	}
	if v := strings.TrimSpace(c.Query("seq")); v != "" {
		whereParts = append(whereParts, `LOWER("Sequence") LIKE '%' || LOWER(?) || '%'`)
		args = append(args, v)
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	orderBy := ""
	if sortCol != "" {
		orderBy = fmt.Sprintf(` ORDER BY "%s" %s`, sortCol, order)
	}
	q := `SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" FROM data ` + where + orderBy
	if lim > 0 {
		q += fmt.Sprintf(" LIMIT %d OFFSET %d", lim, off)
	}
	rows, err := s.db.QueryContext(c.Request.Context(), q, args...)
	if err != nil {
		log.Println("zdnaExport query error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=zdna_export.csv")

	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"Chromosome", "Start", "End", "Z-DNA Score", "Sequence"})
	cols, _ := rows.Columns()
	vals := make([]any, len(cols))
	ptrs := make([]any, len(cols))
	for i := range vals {
		ptrs[i] = &vals[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptrs...); err != nil {
			break
		}
		rec := make([]string, len(cols))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				rec[i] = string(b)
			} else {
				rec[i] = fmt.Sprint(v)
			}
		}
		_ = w.Write(rec)
	}
	w.Flush()
}

func (s *Server) zdnaDistinctChr(c *gin.Context) {
	prefix := strings.TrimSpace(c.DefaultQuery("prefix", ""))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	if limit <= 0 || limit > 1000 {
		limit = 10
	}

	q := `SELECT  "Chromosome" AS v FROM chromosomes`
	args := []any{}
	if prefix != "" {
		q += ` WHERE LOWER("Chromosome") LIKE LOWER(?)`
		args = append(args, prefix+"%")
	}

	q += ` LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v sql.NullString
		_ = rows.Scan(&v)
		if v.Valid && strings.TrimSpace(v.String) != "" {
			out = append(out, v.String)
		}
	}
	c.JSON(http.StatusOK, gin.H{"values": out})
}

// ---------- Histogram ----------
func (s *Server) zdnaScoreHistogram(c *gin.Context) {
	bin, _ := strconv.Atoi(c.DefaultQuery("bin", "5"))
	if bin <= 0 {
		bin = 5
	}
	approx := c.Query("approx") == "1"
	sampleRows, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("sample_rows", "200000")))
	if !approx {
		sampleRows = 0
	}

	assembly, ok := zdnaAssemblyScope(c)
	if !ok {
		return
	}
	whereParts := []string{`"assembly" = ?`}
	args := []any{assembly}
	if v := strings.TrimSpace(c.Query("chr")); v != "" {
		whereParts = append(whereParts, `"Chromosome" = ?`)
		args = append(args, v)
	}
	if v := c.Query("score_min"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" >= ?`)
			args = append(args, n)
		}
	}
	if v := c.Query("score_max"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			whereParts = append(whereParts, `"Z-DNA Score" <= ?`)
			args = append(args, n)
		}
	}
	where := ""
	if len(whereParts) > 0 {
		where = " WHERE " + strings.Join(whereParts, " AND ")
	}

	// DuckDB samples the FROM output before WHERE and rejects USING SAMPLE directly after
	// FROM when WHERE/GROUP BY follow, so filter in a subquery and sample its rows.
	buildSQL := func(withSample bool) string {
		src := `(SELECT "Z-DNA Score" AS score FROM data` + where + `)`
		if withSample && sampleRows > 0 {
			src = fmt.Sprintf("(SELECT * FROM %s f USING SAMPLE %d ROWS)", src, sampleRows)
		}
		return fmt.Sprintf(`
SELECT CAST(floor(score / %[1]d) * %[1]d AS INT) AS bin,
       COUNT(*) AS count
FROM %[2]s s
GROUP BY 1
ORDER BY 1
`, bin, src)
	}
	q := buildSQL(approx)
	rows, err := s.db.QueryContext(c.Request.Context(), q, args...)
	if err != nil && approx {
		q = buildSQL(false)
		rows, err = s.db.QueryContext(c.Request.Context(), q, args...)
	}
	if err != nil {
		log.Println("zdnaScoreHistogram query error:", err, "sql:", q)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type item struct{ Bin, Count int64 }
	data := []item{}
	labels := []int64{}
	values := []int64{}
	binsForUI := []gin.H{}
	for rows.Next() {
		var b, n sql.NullInt64
		if err := rows.Scan(&b, &n); err != nil {
			continue
		}
		bi := b.Int64
		ci := n.Int64
		data = append(data, item{Bin: bi, Count: ci})
		labels = append(labels, bi)
		values = append(values, ci)
		binsForUI = append(binsForUI, gin.H{"bin_start": bi, "n": ci})
	}
	c.JSON(http.StatusOK, gin.H{"data": data, "bins": binsForUI, "labels": labels, "values": values, "datasets": []gin.H{{"label": "Z-DNA Score", "data": values}}, "sample_rows": sampleRows})
}

// ---------- SQL ----------
func (s *Server) sqlGet(c *gin.Context) {
	stmt := strings.TrimSpace(c.Query("query"))
	if stmt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing query parameter"})
		return
	}
	runSQL(s, c, stmt)
}

type sqlPayload struct {
	SQL string `json:"sql"`
}

func (s *Server) sqlPost(c *gin.Context) {
	var p sqlPayload
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}
	runSQL(s, c, strings.TrimSpace(p.SQL))
}

// validateSingleSelect accepts exactly one SELECT statement. It uses DuckDB's own parser:
// json_serialize_sql only serializes SELECT statements and returns one entry per
// statement, so "SELECT 1; DROP TABLE x" and any non-SELECT statement are rejected.
func validateSingleSelect(db *sql.DB, stmt string) error {
	if !strings.HasPrefix(strings.ToUpper(stmt), "SELECT ") {
		return errors.New("only SELECT statements are allowed")
	}
	var failed bool
	var n sql.NullInt64
	err := db.QueryRow(`
		SELECT COALESCE(json_extract(j, '$.error')::BOOLEAN, true), json_array_length(j, '$.statements')
		FROM (SELECT json_serialize_sql(?::VARCHAR) AS j)`, stmt).Scan(&failed, &n)
	if err != nil {
		return err
	}
	if failed || !n.Valid || n.Int64 != 1 {
		return errors.New("only a single SELECT statement is allowed")
	}
	return nil
}

func runSQL(s *Server, c *gin.Context, stmt string) {
	if stmt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty sql"})
		return
	}
	if err := validateSingleSelect(s.db, stmt); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rows, err := s.db.QueryContext(c.Request.Context(), stmt)
	if err != nil {
		log.Println("sql error:", err, "sql:", stmt)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	data, err := rowsToMaps(rows)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// Global base filter for all metadata queries
const metadataBaseFilter = "genome_size_manual >= 1000"

// Metadata column configuration
type metadataColumn struct {
	DbName string // Database column name
	Label  string // Frontend display name
	Hidden bool   // Hidden by default in UI
}

// Column definitions in display order. Labels must match METADATA_COLUMNS in
// frontend/src/utils/metadataColumns.ts, which resolves response columns by label.
var metadataColumns = []metadataColumn{
	{DbName: "assembly", Label: "Assembly", Hidden: false},
	{DbName: "taxid", Label: "Taxon ID", Hidden: false},
	{DbName: "assembly_level", Label: "Assembly level", Hidden: true},
	{DbName: "genome_size_manual", Label: "Genome size", Hidden: false},
	{DbName: "gc_percent", Label: "%GC", Hidden: false},
	{DbName: "superkingdom", Label: "Superkingdom", Hidden: false},
	{DbName: "kingdom", Label: "Kingdom", Hidden: false},
	{DbName: "phylum", Label: "Phylum", Hidden: false},
	{DbName: "class", Label: "Class", Hidden: false},
	{DbName: "order", Label: "Order", Hidden: false},
	{DbName: "family", Label: "Family", Hidden: false},
	{DbName: "genus", Label: "Genus", Hidden: false},
	{DbName: "tax_name", Label: "Species", Hidden: false},
	{DbName: "viral_realm", Label: "Viral realm", Hidden: false},
	{DbName: "updated_tax_name", Label: "Full organism name", Hidden: false},
	{DbName: "infraspecific_name", Label: "Infraspecific name", Hidden: true},
	{DbName: "species_taxid", Label: "Species taxon ID", Hidden: true},
	{DbName: "genome_size_ungapped", Label: "Genome size (ungapped)", Hidden: true},
	{DbName: "replicon_count", Label: "Replicons", Hidden: true},
	{DbName: "scaffold_count", Label: "Scaffolds", Hidden: true},
	{DbName: "contig_count", Label: "Contigs", Hidden: true},
	{DbName: "reference_genome", Label: "Reference genome", Hidden: true},
	{DbName: "obs_zbp", Label: "Z-DNA bases count", Hidden: false},
	{DbName: "obs_density_per_kb", Label: "Z-DNA density per kb", Hidden: false},
	{DbName: "obs_n_zdna", Label: "Z-DNA predictions count", Hidden: false},
}

// Helper to build SELECT clause with proper column aliases
func buildMetadataSelect() string {
	parts := make([]string, len(metadataColumns))
	for i, col := range metadataColumns {
		if col.Label == col.DbName {
			parts[i] = quoteIdent(col.DbName)
		} else {
			parts[i] = fmt.Sprintf("%s AS %s",
				quoteIdent(col.DbName),
				quoteIdent(col.Label))
		}
	}
	return strings.Join(parts, ", ")
}

// Helper to get ordered column labels
func getMetadataColumns() []string {
	cols := make([]string, len(metadataColumns))
	for i, col := range metadataColumns {
		cols[i] = col.Label
	}
	return cols
}

// ---------- CORS & main ----------
func corsMiddleware(allowed []string) gin.HandlerFunc {
	allowAll := false
	set := map[string]struct{}{}
	for _, o := range allowed {
		o = strings.TrimSpace(o)
		if o == "*" {
			allowAll = true
		} else if o != "" {
			set[o] = struct{}{}
		}
	}
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if allowAll && origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if _, ok := set[origin]; ok {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Vary", "Origin")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}

	var db *sql.DB
	var dbErr error
	if _, err := os.Stat(cfg.DBPath); err != nil {
		dbErr = err
		if errors.Is(err, os.ErrNotExist) {
			log.Printf("DuckDB file not found at %s; starting without database", cfg.DBPath)
		} else {
			log.Printf("Cannot inspect DuckDB path %s; starting without database: %v", cfg.DBPath, err)
		}
	} else {
		log.Printf("Opening DuckDB at %s", cfg.DBPath)
		db, dbErr = openDuckDB(cfg)
		if dbErr != nil {
			log.Printf("Cannot open DuckDB; starting without database: %v", dbErr)
			db = nil
		}
	}
	if db != nil {
		defer db.Close()
	}

	s := &Server{cfg: cfg, db: db, dbErr: dbErr}
	if s.db != nil {
		_ = s.createOrReplaceViews()
		go s.loadInsights() // warm the homepage insights in the background
	}

	r := gin.New()
	r.Use(gin.Recovery()) // panic recovery without request logging
	r.Use(corsMiddleware(cfg.CORSOrigins))
	r.Use(s.databaseRequired())

	// health/admin
	r.GET("/api/health", s.health)
	r.POST("/api/admin/init", s.adminInit)

	// metadata
	r.GET("/api/metadata/distinct", s.metadataDistinct)
	r.GET("/api/metadata/list", s.metadataList)
	r.GET("/api/metadata/classes/top", s.metadataTopClasses)
	r.GET("/api/metadata/export", s.metadataExport)
	r.GET("/api/metadata/charts", s.metadataCharts)

	// zdna
	r.GET("/api/zdna/search", s.zdnaSearch)
	r.GET("/api/zdna/export", s.zdnaExport)
	r.GET("/api/zdna/distinct_chr", s.zdnaDistinctChr)
	r.GET("/api/zdna/score_histogram", s.zdnaScoreHistogram)

	// home insights (fast-path: parallel queries + 15-min server cache + gzip + browser cache)
	r.GET("/api/home/insights", s.homeInsights)

	// sql helpers
	r.GET("/api/sql", s.sqlGet)
	r.POST("/api/sql", s.sqlPost)

	// quick previews
	r.GET("/api/metadata/preview", func(c *gin.Context) {
		selectList := buildMetadataSelect()
		rows, err := s.db.Query(
			"SELECT " + selectList +
				" FROM metadata WHERE " + metadataBaseFilter +
				" LIMIT 100",
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		data, _ := rowsToMaps(rows)
		c.JSON(http.StatusOK, gin.H{
			"columns": getMetadataColumns(),
			"data":    data,
		})
	})
	r.GET("/api/zdna/preview", func(c *gin.Context) {
		rows, err := s.db.Query(`SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" FROM data LIMIT 100`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		data, _ := rowsToMaps(rows)
		c.JSON(http.StatusOK, gin.H{"data": data})
	})
	r.NoRoute(frontendHandler(cfg.StaticDir))

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	log.Printf("ZDNA backend listening on http://%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}
