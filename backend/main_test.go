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
			taxid BIGINT,
			obs_density_per_kb DOUBLE,
			genome_size BIGINT,
			superkingdom VARCHAR
		)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`
		INSERT INTO metadata VALUES
			('Example kingdom', 1, 0, 2000, 'Bacteria'),
			('Example kingdom', 1, 10, 2000, 'Bacteria'),
			('Example kingdom', 2, 15, 2000, 'Bacteria')
		`); err != nil {
		t.Fatal(err)
	}

	initial := queryFirstKingdomDensity(t, db)
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
		       CAST(50 + i % 100 AS FLOAT) AS "Z-DNA Score"
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
	if n := total("/api/zdna/score_histogram?chr=A"); n != 5000 {
		t.Fatalf("exact histogram counted %d rows, want 5000", n)
	}
	if n := total("/api/zdna/score_histogram?chr=A&approx=1&sample_rows=300"); n != 300 {
		t.Fatalf("sampled histogram counted %d rows, want 300 (sample taken after the chr filter)", n)
	}
}

func TestMetadataExportWithExtraTableColumns(t *testing.T) {
	cols := []string{}
	for _, c := range metadataColumns {
		typ := "VARCHAR"
		if c.DbName == "genome_size" {
			typ = "BIGINT"
		}
		cols = append(cols, quoteIdent(c.DbName)+" "+typ)
	}
	// metadata carries columns that are not exported; the export must still emit rows.
	s := newTestServer(t,
		"CREATE TABLE metadata ("+strings.Join(cols, ", ")+", genome_size_manual BIGINT)",
		"INSERT INTO metadata (assembly, genome_size, tax_name) VALUES ('GCF_1.1', 5000, 'x'), ('GCF_2.1', 10, 'y')")
	records, err := csv.NewReader(serve(t, s.metadataExport, "/api/metadata/export").Body).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[1][0] != "GCF_1.1" {
		t.Fatalf("export = %v, want header + GCF_1.1 (genome_size < 1000 filtered)", records)
	}
	if len(records[0]) != len(metadataColumns) {
		t.Fatalf("header has %d columns, want %d", len(records[0]), len(metadataColumns))
	}
}
