package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	_ "github.com/marcboeker/go-duckdb"
)

type kingdomDensityResult struct {
	label         string
	density       float64
	assemblyCount int64
	uniqueTaxids  int64
	superkingdom  string
}

func queryFirstKingdomDensity(t *testing.T, db *sql.DB) kingdomDensityResult {
	t.Helper()
	var result kingdomDensityResult
	if err := db.QueryRow(homeTopKingdomsQuery).Scan(
		&result.label,
		&result.density,
		&result.assemblyCount,
		&result.uniqueTaxids,
		&result.superkingdom,
	); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestHomeTopKingdomsUsesTaxidBalancedMean(t *testing.T) {
	db, err := sql.Open("duckdb", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE metadata (
			kingdom VARCHAR,
			species_taxid BIGINT,
			obs_density_per_kb DOUBLE,
			genome_size_manual BIGINT,
			superkingdom VARCHAR
		)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`
		INSERT INTO metadata VALUES
			('Example kingdom', 1, 0, 2000, 'Bacteria'),
			('Example kingdom', 1, 10, 2000, 'Bacteria'),
			('Example kingdom', 2, 15, 2000, 'Bacteria'),
			('unclassified Bacteria', 3, 99, 2000, 'Bacteria')
		`); err != nil {
		t.Fatal(err)
	}

	initial := queryFirstKingdomDensity(t, db)
	if initial.label != "Example kingdom" {
		t.Fatalf("top kingdom = %q, want unclassified kingdoms excluded", initial.label)
	}
	if math.Abs(initial.density-10) > 1e-9 {
		t.Fatalf("density = %v, want taxid-balanced mean 10", initial.density)
	}
	if initial.assemblyCount != 3 || initial.uniqueTaxids != 2 {
		t.Fatalf(
			"counts = %d assemblies and %d taxids, want 3 and 2",
			initial.assemblyCount,
			initial.uniqueTaxids,
		)
	}

	// A same-mean assembly changes the assembly count but not taxid 1's weight.
	if _, err := db.Exec(`
		INSERT INTO metadata VALUES
			('Example kingdom', 1, 5, 2000, 'Bacteria')
		`); err != nil {
		t.Fatal(err)
	}
	afterExtraAssembly := queryFirstKingdomDensity(t, db)
	if math.Abs(afterExtraAssembly.density-initial.density) > 1e-9 {
		t.Fatalf(
			"adding an assembly changed the group mean from %v to %v",
			initial.density,
			afterExtraAssembly.density,
		)
	}
	if afterExtraAssembly.assemblyCount != 4 || afterExtraAssembly.uniqueTaxids != 2 {
		t.Fatalf(
			"counts = %d assemblies and %d taxids, want 4 and 2",
			afterExtraAssembly.assemblyCount,
			afterExtraAssembly.uniqueTaxids,
		)
	}
}

func newTestServer(t *testing.T, ddl ...string) *Server {
	t.Helper()
	db, err := sql.Open("duckdb", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, stmt := range ddl {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatal(err)
		}
	}
	return &Server{cfg: &Config{}, db: db}
}

func serve(t *testing.T, h gin.HandlerFunc, target string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, target, nil)
	h(c)
	if w.Code != http.StatusOK {
		t.Fatalf("%s: HTTP %d: %s", target, w.Code, w.Body.String())
	}
	return w
}

func TestScoreHistogramSamplesFilteredRows(t *testing.T) {
	s := newTestServer(t, `
		CREATE TABLE data AS
		SELECT CASE WHEN i % 2 = 0 THEN 'A' ELSE 'B' END AS "Chromosome",
		       CAST(50 + i % 100 AS FLOAT) AS "Z-DNA Score",
		       CASE WHEN i < 9000 THEN 'GCF_1.1' ELSE 'GCF_2.1' END AS assembly
		FROM range(10000) r(i)`)
	total := func(target string) int64 {
		var resp struct {
			Values []int64 `json:"values"`
		}
		if err := json.Unmarshal(serve(t, s.zdnaScoreHistogram, target).Body.Bytes(), &resp); err != nil {
			t.Fatal(err)
		}
		var n int64
		for _, v := range resp.Values {
			n += v
		}
		return n
	}
	if n := total("/api/zdna/score_histogram?assembly_eq=GCF_1.1&chr=A"); n != 4500 {
		t.Fatalf("exact histogram counted %d rows, want 4500", n)
	}
	if n := total("/api/zdna/score_histogram?assembly_eq=GCF_1.1&chr=A&approx=1&sample_rows=300"); n != 300 {
		t.Fatalf("sampled histogram counted %d rows, want 300 (sample taken after the chr filter)", n)
	}
}

func TestMetadataExportWithExtraTableColumns(t *testing.T) {
	cols := []string{}
	for _, c := range metadataColumns {
		typ := "VARCHAR"
		if c.DbName == "genome_size_manual" {
			typ = "BIGINT"
		}
		cols = append(cols, quoteIdent(c.DbName)+" "+typ)
	}
	// metadata carries columns that are not exported; the export must still emit rows.
	s := newTestServer(t,
		"CREATE TABLE metadata ("+strings.Join(cols, ", ")+", genome_size BIGINT)",
		"INSERT INTO metadata (assembly, genome_size_manual, tax_name) VALUES ('GCF_1.1', 5000, 'x'), ('GCF_2.1', 10, 'y')")
	records, err := csv.NewReader(serve(t, s.metadataExport, "/api/metadata/export").Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[1][0] != "GCF_1.1" {
		t.Fatalf("export = %v, want header + GCF_1.1 (genome_size_manual < 1000 filtered)", records)
	}
	if len(records[0]) != len(metadataColumns) {
		t.Fatalf("header has %d columns, want %d", len(records[0]), len(metadataColumns))
	}
}

func TestMetadataExportAppliesFiltersAndFormats(t *testing.T) {
	cols := []string{}
	for _, c := range metadataColumns {
		typ := "VARCHAR"
		if c.DbName == "genome_size_manual" {
			typ = "BIGINT"
		}
		cols = append(cols, quoteIdent(c.DbName)+" "+typ)
	}
	s := newTestServer(t,
		"CREATE TABLE metadata ("+strings.Join(cols, ", ")+")",
		`INSERT INTO metadata (assembly, genome_size_manual, superkingdom, kingdom) VALUES
			('GCF_1.1', 5000, 'Eukaryota', 'Metazoa'), ('GCF_2.1', 5000, 'Bacteria', NULL)`)

	records, err := csv.NewReader(serve(t, s.metadataExport, "/api/metadata/export?filter_on_tax=1&superkingdom=Eukaryota&limit=all").Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[1][0] != "GCF_1.1" {
		t.Fatalf("filtered export = %v, want only GCF_1.1", records)
	}

	body := serve(t, s.metadataExport, "/api/metadata/export?fmt=json&superkingdom=Bacteria").Body.String()
	var out []map[string]any
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatalf("json export invalid: %v\n%s", err, body)
	}
	if len(out) != 1 || out[0]["Assembly"] != "GCF_2.1" || out[0]["Kingdom"] != nil {
		t.Fatalf("json export = %v, want GCF_2.1 with null Kingdom", out)
	}

	tsv := serve(t, s.metadataExport, "/api/metadata/export?fmt=tsv").Body.String()
	if !strings.HasPrefix(tsv, "Assembly\t") || strings.Contains(tsv, "<nil>") {
		t.Fatalf("tsv export = %q", tsv)
	}
}

func TestSQLEndpointAcceptsOnlyOneSelect(t *testing.T) {
	s := newTestServer(t, "CREATE TABLE metadata AS SELECT 1 AS x")
	if err := lockDownEngine(s.db); err != nil {
		t.Fatal(err)
	}
	reject := []string{
		"SELECT 1; DROP TABLE metadata",
		"SELECT 1 AS a; CREATE TABLE injected AS SELECT 42",
		"SELECT 1; DETACH memory",
		"DROP TABLE metadata",
		"SELECT 1; SET lock_configuration = false",
	}
	for _, q := range reject {
		if err := validateSingleSelect(s.db, q); err == nil {
			t.Errorf("accepted %q", q)
		}
	}
	for _, q := range []string{
		"SELECT x FROM metadata",
		"SELECT COUNT(*) AS n FROM (SELECT x FROM metadata) WHERE x > 0",
		`SELECT x, ROW_NUMBER() OVER (ORDER BY x) AS r FROM metadata WHERE x IN (SELECT 1)`,
	} {
		if err := validateSingleSelect(s.db, q); err != nil {
			t.Errorf("rejected %q: %v", q, err)
		}
	}
	var n int
	if err := s.db.QueryRow("SELECT COUNT(*) FROM metadata").Scan(&n); err != nil || n != 1 {
		t.Fatalf("metadata changed: n=%d err=%v", n, err)
	}
	// After lockDownEngine, a single SELECT cannot read files or re-enable access.
	if _, err := s.db.Query("SELECT * FROM read_text('/etc/hostname')"); err == nil {
		t.Error("read_text allowed after lockDownEngine")
	}
	if _, err := s.db.Exec("SET enable_external_access = true"); err == nil {
		t.Error("configuration not locked")
	}
}

func TestRawZdnaEndpointsRequireAssembly(t *testing.T) {
	s := newTestServer(t, `CREATE TABLE data AS SELECT 'A' AS "Chromosome", 1::BIGINT AS "Start", 9::BIGINT AS "End",
		50::FLOAT AS "Z-DNA Score", 'CGCGCGCGC' AS "Sequence", 'GCF_1.1' AS assembly`)
	gin.SetMode(gin.TestMode)
	for name, h := range map[string]gin.HandlerFunc{
		"search": s.zdnaSearch, "export": s.zdnaExport, "score_histogram": s.zdnaScoreHistogram,
	} {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodGet, "/api/zdna/"+name, nil)
		h(c)
		if w.Code != http.StatusBadRequest {
			t.Errorf("%s without assembly_eq: HTTP %d, want 400", name, w.Code)
		}
	}
	body := serve(t, s.zdnaExport, "/api/zdna/export?assembly_eq=GCF_1.1").Body.String()
	if !strings.Contains(body, "CGCGCGCGC") {
		t.Errorf("export with assembly_eq = %q", body)
	}
}

func TestDistinctChrHonoursLimit(t *testing.T) {
	s := newTestServer(t, `CREATE TABLE chromosomes AS SELECT 'chr' || i AS "Chromosome" FROM range(50) r(i)`)
	var resp map[string]any
	if err := json.Unmarshal(serve(t, s.zdnaDistinctChr, "/api/zdna/distinct_chr?limit=3").Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	for _, v := range resp {
		if arr, ok := v.([]any); ok && len(arr) > 3 {
			t.Fatalf("got %d values, want at most 3", len(arr))
		}
	}
}

func TestAdminInitNeedsToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	call := func(token, header string) int {
		s := newTestServer(t)
		s.cfg.AdminToken = token
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest(http.MethodPost, "/api/admin/init", nil)
		if header != "" {
			c.Request.Header.Set("X-Admin-Token", header)
		}
		s.adminInit(c)
		return w.Code
	}
	if code := call("", ""); code != http.StatusNotFound {
		t.Errorf("no ADMIN_TOKEN: HTTP %d, want 404", code)
	}
	if code := call("secret", "wrong"); code != http.StatusForbidden {
		t.Errorf("wrong token: HTTP %d, want 403", code)
	}
	if code := call("secret", "secret"); code != http.StatusOK {
		t.Errorf("right token: HTTP %d, want 200", code)
	}
}

func TestMetadataChartsBalancesBySpeciesTaxid(t *testing.T) {
	// Genus G1: species taxid 1 has two assemblies (0 and 10 /kb) and taxid 2 one (20 /kb):
	// the taxid-balanced mean is (5 + 20) / 2 = 12.5, not the assembly mean 10.
	s := newTestServer(t, `
		CREATE TABLE metadata (assembly VARCHAR, genus VARCHAR, species_taxid BIGINT, obs_density_per_kb DOUBLE,
			genome_size_manual BIGINT, gc_percent DOUBLE, superkingdom VARCHAR, tax_name VARCHAR)`,
		`INSERT INTO metadata VALUES
			('A1', 'G1', 1, 0, 2000, 40, 'Bacteria', 's1'),
			('A2', 'G1', 1, 10, 2000, 50, 'Bacteria', 's1'),
			('A3', 'G1', 2, 20, 4000, 60, 'Bacteria', 's2'),
			('A4', 'unclassified Bacteria', 3, 99, 2000, 50, 'Bacteria', 's3')`)
	var resp struct {
		Genera []struct {
			Genus   string  `json:"genus"`
			Density float64 `json:"density"`
			Taxids  int     `json:"taxids"`
		} `json:"genera"`
		Points [][]any `json:"points"`
	}
	if err := json.Unmarshal(serve(t, s.metadataCharts, "/api/metadata/charts").Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Genera) != 1 || resp.Genera[0].Genus != "G1" || resp.Genera[0].Density != 12.5 || resp.Genera[0].Taxids != 2 {
		t.Fatalf("genera = %+v, want only G1 with taxid-balanced density 12.5", resp.Genera)
	}
	if len(resp.Points) != 3 {
		t.Fatalf("got %d points, want one per species taxid (3)", len(resp.Points))
	}
}

func TestMetadataListFreeTextSearch(t *testing.T) {
	cols := []string{}
	for _, c := range metadataColumns {
		typ := "VARCHAR"
		if c.DbName == "genome_size_manual" {
			typ = "BIGINT"
		}
		cols = append(cols, quoteIdent(c.DbName)+" "+typ)
	}
	s := newTestServer(t,
		"CREATE TABLE metadata ("+strings.Join(cols, ", ")+")",
		`INSERT INTO metadata (assembly, genome_size_manual, tax_name) VALUES
			('GCF_1.1', 5000, 'Escherichia coli'), ('GCF_2.1', 5000, 'Homo sapiens')`)
	var resp struct {
		Total int64            `json:"total"`
		Rows  []map[string]any `json:"rows"`
	}
	if err := json.Unmarshal(serve(t, s.metadataList, "/api/metadata/list?q=coli").Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Total != 1 || len(resp.Rows) != 1 || resp.Rows[0]["Assembly"] != "GCF_1.1" {
		t.Fatalf("q=coli -> total %d rows %v, want only GCF_1.1", resp.Total, resp.Rows)
	}
}
