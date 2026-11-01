package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSQLWhitelist(t *testing.T) {
	for _, q := range []string{
		`SELECT "Chromosome", COUNT(*) FROM data GROUP BY 1`,
		`WITH s AS (SELECT * FROM data) SELECT COUNT(*) FROM s`,
		`SELECT * FROM metadata WHERE tax_name = 'O''Brien; DROP TABLE data'`,
		`SELECT quantile("Z-DNA Score",0.25) FROM data`,
		`SELECT COUNT(*) OVER () FROM data`,
	} {
		if err := validateSQL(q); err != nil {
			t.Errorf("rejected %s: %v", q, err)
		}
	}
	for _, q := range []string{
		`SELECT 1; DROP TABLE data`, `WITH s AS (DELETE FROM data RETURNING *) SELECT * FROM s`,
		`SELECT * FROM read_csv('/etc/passwd')`, `SELECT * FROM 'data.csv'`,
		`SELECT * FROM "read_csv"('/etc/passwd')`, `SELECT * FROM query('DROP TABLE data')`,
		`SELECT current_setting('temp_directory')`, `SELECT 1 /* comment */`,
		`PRAGMA version`, `COPY data TO '/tmp/data.csv'`, `SELECT * FROM information_schema.tables`,
		`SELECT $$hello$$`, strings.Repeat("x", sqlMaxLength+1),
	} {
		if err := validateSQL(q); err == nil {
			t.Errorf("accepted %s", q)
		}
	}
}

func fixtureServer(t *testing.T) *Server {
	t.Helper()
	db, err := sql.Open("duckdb", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	statements := []string{
		`CREATE TABLE data ("Chromosome" VARCHAR,"Start" BIGINT,"End" BIGINT,"Z-DNA Score" FLOAT,"Sequence" VARCHAR,assembly VARCHAR)`,
		`INSERT INTO data VALUES ('NC_060925.1',0,3,60,'ACGT','GCF_009914755.1'),('NC_060949.1',10,13,70,'ACGT','GCF_009914755.1'),('NC_060925.1',0,3,80,'ACGT','GCF_other.1')`,
		`CREATE TABLE metadata_all (assembly VARCHAR,species_taxid BIGINT,genome_size BIGINT,gc_percent DOUBLE,superkingdom VARCHAR,kingdom VARCHAR,obs_density_per_kb DOUBLE)`,
		`INSERT INTO metadata_all VALUES ('a',1,100,10,'Bacteria','KingdomA',10),('b',1,300,30,'Bacteria','KingdomA',30),('c',2,1000,60,'Bacteria','KingdomA',0),('d',3,500,50,'Bacteria','Unclassified kingdom',999)`,
		`CREATE TABLE data_kpis AS SELECT COUNT(*) total_sites FROM data`,
	}
	for _, q := range statements {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	return &Server{db: db}
}

func request(t *testing.T, s *Server, path string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", path, nil)
	handler(c)
	return w
}

func TestHomepageBalancesSpeciesAndCountsSmallEmptyAssemblies(t *testing.T) {
	s := fixtureServer(t)
	var n, species, predictions int64
	var gs, gc float64
	if err := s.db.QueryRow(homeKPIsQuery).Scan(&n, &species, &gs, &gc, &predictions); err != nil {
		t.Fatal(err)
	}
	if n != 4 || species != 3 || predictions != 3 || gs != 1700.0/3 || gc != 130.0/3 {
		t.Fatalf("unexpected KPIs %d %d %f %f %d", n, species, gs, gc, predictions)
	}
	var name, sk string
	var density float64
	var count, speciesCount int64
	if err := s.db.QueryRow(homeTopKingdomsQuery).Scan(&name, &density, &count, &speciesCount, &sk); err != nil {
		t.Fatal(err)
	}
	if name != "KingdomA" || density != 10 || count != 3 || speciesCount != 2 {
		t.Fatalf("not species balanced: %s %f %d", name, density, count)
	}
	var total int64
	if err := s.db.QueryRow(`SELECT SUM(n)::BIGINT FROM (` + homeSuperkingdomsQuery + `)`).Scan(&total); err != nil || total != n {
		t.Fatalf("count sum %d: %v", total, err)
	}
}

func TestHumanSearchExportAndHistogram(t *testing.T) {
	s := fixtureServer(t)
	for _, assembly := range []string{humanAssembly, "GCF_other.1"} {
		label := "1"
		expected := "1"
		if assembly != humanAssembly {
			label = "NC_060925.1"
			expected = label
		}
		query := "?assembly_eq=" + assembly + "&chr=" + label
		w := request(t, s, "/api/zdna/search"+query, s.zdnaSearch)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		var result struct {
			Rows []map[string]any `json:"rows"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if len(result.Rows) != 1 || result.Rows[0]["Chromosome"] != expected {
			t.Fatal(w.Body.String())
		}
		w = request(t, s, "/api/zdna/export"+query, s.zdnaExport)
		rows, err := csv.NewReader(strings.NewReader(w.Body.String())).ReadAll()
		if err != nil || len(rows) != 2 || len(rows[1]) != 5 || rows[1][0] != expected {
			t.Fatalf("bad export: %s %v", w.Body.String(), err)
		}
		w = request(t, s, "/api/zdna/score_histogram"+query+"&approx=1", s.zdnaScoreHistogram)
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
	}
	w := request(t, s, "/api/zdna/export?assembly_eq="+humanAssembly+"&chr=NC_060949.1", s.zdnaExport)
	if !strings.Contains(w.Body.String(), "NC_060949.1") {
		t.Fatal(w.Body.String())
	}
	w = request(t, s, "/api/zdna/distinct_chr?assembly_eq="+humanAssembly+"&prefix=1", s.zdnaDistinctChr)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"1"`) {
		t.Fatal(w.Body.String())
	}
	w = request(t, s, "/api/zdna/distinct_chr?assembly_eq="+humanAssembly+"&prefix=NC_060925.1", s.zdnaDistinctChr)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"1"`) {
		t.Fatal(w.Body.String())
	}

}

func TestHumanChromosomeRoundTrip(t *testing.T) {
	for _, pair := range [][2]string{{"NC_060925.1", "1"}, {"NC_060946.1", "22"}, {"NC_060947.1", "X"}, {"NC_060948.1", "Y"}, {"NC_060949.1", "NC_060949.1"}} {
		if displayChromosome(pair[0], humanAssembly) != pair[1] || accessionChromosome(pair[1], humanAssembly) != pair[0] {
			t.Fatal(pair)
		}
		if displayChromosome(pair[0], "other") != pair[0] || accessionChromosome(pair[1], "other") != pair[1] {
			t.Fatal("non-human changed", pair)
		}
	}
}

func TestSQLResultCap(t *testing.T) {
	s := fixtureServer(t)
	w := request(t, s, "/api/sql", func(c *gin.Context) { runSQL(s, c, `SELECT 1 FROM data a CROSS JOIN data b`) })
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	// A small physical relation creates >50k rows without an unapproved table function.
	if _, err := s.db.Exec(`CREATE OR REPLACE TABLE data AS SELECT * FROM data CROSS JOIN (SELECT range n FROM range(30))`); err != nil {
		t.Fatal(err)
	}
	w = request(t, s, "/api/sql", func(c *gin.Context) { runSQL(s, c, `SELECT 1 FROM data a CROSS JOIN data b CROSS JOIN data c`) })
	var payload struct {
		Data      []map[string]any `json:"data"`
		Truncated bool             `json:"truncated"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(w.Body.String())
	}
	if len(payload.Data) != sqlMaxRows || !payload.Truncated {
		t.Fatalf("cap failed: %d, %v", len(payload.Data), payload.Truncated)
	}
}

func TestRuntimeDisablesExternalAccess(t *testing.T) {
	dir := t.TempDir()
	cfg := &Config{DBPath: dir + "/test.duckdb", Threads: 1, TempDir: dir + "/spill", MaxTempGiB: 1, MemoryLimitGB: 1}
	source, err := sql.Open("duckdb", cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := source.Exec(`CREATE TABLE data ("Chromosome" VARCHAR, "Start" BIGINT, "End" BIGINT, "Z-DNA Score" FLOAT, "Sequence" VARCHAR, assembly VARCHAR);
        CREATE TABLE metadata (assembly VARCHAR);
        CREATE TABLE metadata_all (assembly VARCHAR, species_taxid BIGINT);
        CREATE VIEW metadata_view AS SELECT assembly FROM metadata;
        CREATE VIEW zdna AS SELECT * FROM data`); err != nil {
		t.Fatal(err)
	}
	source.Close()
	db, err := openDuckDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, name := range []string{"metadata", "metadata_all", "metadata_view", "zdna"} {
		var n int
		if err := db.QueryRow("SELECT COUNT(*) FROM " + name).Scan(&n); err != nil {
			t.Fatal(name, err)
		}
	}
	if _, err = db.Exec(`INSERT INTO zdb.main.data VALUES ('x',0,0,50,'A','a')`); err == nil {
		t.Fatal("release predictions are writable")
	}
	if _, err = db.Exec(`CREATE TABLE runtime_test AS SELECT 1 n`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`SET enable_external_access=true`); err == nil {
		t.Fatal("configuration was not locked")
	}
	if _, err = db.Query(`SELECT * FROM read_csv('/etc/passwd')`); err == nil {
		t.Fatal("external files are accessible")
	}
}

// Run against a completed local release without opening a public network port.
func TestFinalDatabaseSmoke(t *testing.T) {
	path := os.Getenv("INTEGRATION_DUCKDB_PATH")
	if path == "" {
		t.Skip("set INTEGRATION_DUCKDB_PATH for the full-dataset smoke check")
	}
	db, err := openDuckDB(&Config{DBPath: path, Threads: 4, TempDir: t.TempDir(), MaxTempGiB: 2, MemoryLimitGB: 4})
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := &Server{db: db}
	w := request(t, s, "/api/home/insights", s.homeInsights)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	var response struct {
		KPIs struct {
			Assemblies  int64 `json:"total_assemblies"`
			Taxids      int64 `json:"unique_taxids"`
			Predictions int64 `json:"total_predictions"`
		} `json:"kpis"`
		Superkingdoms []struct {
			N int64 `json:"n"`
		} `json:"superkingdoms"`
		Kingdoms []struct {
			Label string `json:"label"`
		} `json:"top_kingdoms"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	var expectedAssemblies, expectedTaxids, expectedPredictions int64
	if err := db.QueryRow(`SELECT COUNT(*),COUNT(DISTINCT species_taxid),(SELECT COUNT(*) FROM data) FROM metadata_all`).Scan(&expectedAssemblies, &expectedTaxids, &expectedPredictions); err != nil {
		t.Fatal(err)
	}
	if response.KPIs.Assemblies != expectedAssemblies || response.KPIs.Taxids != expectedTaxids || response.KPIs.Predictions != expectedPredictions {
		t.Fatal("homepage totals differ from release")
	}
	var sum int64
	for _, sk := range response.Superkingdoms {
		sum += sk.N
	}
	if sum != expectedAssemblies {
		t.Fatal("superkingdom sum differs from release")
	}
	if len(response.Kingdoms) != 10 {
		t.Fatal("expected ten kingdoms")
	}
	for _, kingdom := range response.Kingdoms {
		if strings.Contains(strings.ToLower(kingdom.Label), "unclassified") {
			t.Fatal(kingdom.Label)
		}
	}
	w = request(t, s, "/api/zdna/search?assembly_eq="+humanAssembly+"&chr=1&limit=2", s.zdnaSearch)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"Chromosome":"1"`) {
		t.Fatal(w.Body.String())
	}
	t.Logf("verified homepage: %d assemblies, %d species taxids, %d predictions", expectedAssemblies, expectedTaxids, expectedPredictions)
}
