package main

import (
	"database/sql"
	"math"
	"testing"

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
