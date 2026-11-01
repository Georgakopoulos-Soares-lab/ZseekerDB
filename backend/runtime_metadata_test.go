package main

import (
	"compress/gzip"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mountedMetadataFixture(t *testing.T, suffix string) (*Config, string) {
	t.Helper()
	dir := t.TempDir()
	cfg := &Config{DBPath: filepath.Join(dir, "mounted.duckdb"), MetadataGlob: filepath.Join(dir, "metadata.tsv"+suffix), Threads: 1, TempDir: filepath.Join(dir, "spill"), MaxTempGiB: 1, MemoryLimitGB: 1}
	source, err := sql.Open("duckdb", cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = source.Exec(`
  CREATE TABLE metadata (assembly VARCHAR, species_taxid BIGINT, obs_n_zdna BIGINT, obs_zbp BIGINT, is_t2t BOOLEAN);
  INSERT INTO metadata VALUES ('a',1,999,8,true);
  CREATE TABLE data ("Chromosome" VARCHAR,"Start" BIGINT,"End" BIGINT,"Z-DNA Score" FLOAT,"Sequence" VARCHAR,assembly VARCHAR);
  INSERT INTO data VALUES ('native',0,3,60,'ACGT','a'), ('native',4,7,70,'ACGT','a');
  CREATE TABLE data_top_asm AS SELECT 'a'::VARCHAR AS k,2::BIGINT AS c;
  CREATE TABLE data_kpis AS SELECT 2::BIGINT AS total_sites;
  CREATE VIEW metadata_view AS SELECT assembly FROM metadata;
  CREATE VIEW zdna AS SELECT * FROM data;
 `)
	source.Close()
	if err != nil {
		t.Fatal(err)
	}
	// Prediction summaries in the TSV deliberately disagree with the database.
	text := "assembly_accession\tncbi_summary_species_taxid\tgenome_size\tgc_percent\tsuperkingdom\tkingdom\ttax_name\tz_predictions_count\ttotal_z_bases\tz_density\n" +
		"a\t1\t1000\t40\tBacteria\tK\tS1\t12345\t999999\t99\n" +
		"b\t1\t3000\t60\tBacteria\tK\tS1\t999\t999999\t99\n" +
		"c\t2\t4000\t80\tBacteria\tK\tS2\t999\t999999\t99\n"
	f, err := os.Create(cfg.MetadataGlob)
	if err != nil {
		t.Fatal(err)
	}
	if suffix == ".gz" {
		writer := gzip.NewWriter(f)
		_, err = writer.Write([]byte(text))
		if closeErr := writer.Close(); err == nil {
			err = closeErr
		}
	} else {
		_, err = f.WriteString(text)
	}
	f.Close()
	if err != nil {
		t.Fatal(err)
	}
	return cfg, text
}

func TestMountedDatabaseWithoutMetadataAll(t *testing.T) {
	for _, suffix := range []string{"", ".gz"} {
		t.Run("tsv"+suffix, func(t *testing.T) {
			cfg, _ := mountedMetadataFixture(t, suffix)
			db, err := openDuckDB(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			var n, species, predictions int64
			var gs, gc float64
			if err := db.QueryRow(homeKPIsQuery).Scan(&n, &species, &gs, &gc, &predictions); err != nil {
				t.Fatal(err)
			}
			if n != 3 || species != 2 || predictions != 2 || gs != 3000 || gc != 65 {
				t.Fatalf("unexpected complete KPIs: %d %d %d %f %f", n, species, predictions, gs, gc)
			}
			var sites, bases int64
			var density float64
			var t2t bool
			if err := db.QueryRow("SELECT obs_n_zdna,obs_zbp,obs_density_per_kb,is_t2t FROM metadata WHERE assembly='a'").Scan(&sites, &bases, &density, &t2t); err != nil {
				t.Fatal(err)
			}
			if sites != 2 || bases != 8 || density != 8 || !t2t {
				t.Fatalf("TSV overwrote mounted observations: %d %d %f %v", sites, bases, density, t2t)
			}
			if err := db.QueryRow("SELECT SUM(obs_n_zdna+obs_zbp+obs_density_per_kb)::BIGINT FROM metadata_all WHERE assembly IN ('b','c')").Scan(&sites); err != nil || sites != 0 {
				t.Fatalf("zero-prediction assemblies: %d %v", sites, err)
			}
			if err := db.QueryRow("SELECT COUNT(*) FROM metadata").Scan(&sites); err != nil || sites != 1 {
				t.Fatalf("browser cohort: %d %v", sites, err)
			}
			columns, err := relationColumns(db, "metadata")
			if err != nil || !columns["species_taxid"] {
				t.Fatalf("species grouping unavailable: %v", err)
			}
			if _, err := db.Exec("CREATE TABLE zdb.main.injected(n INT)"); err == nil {
				t.Fatal("mounted database is writable")
			}
			if _, err := db.Exec("SET enable_external_access=true"); err == nil {
				t.Fatal("external access is not locked")
			}
			var schema int
			if err := db.QueryRow("SELECT COUNT(*) FROM duckdb_tables() WHERE database_name='zdb' AND table_name='metadata_all'").Scan(&schema); err != nil || schema != 0 {
				t.Fatalf("volume schema was modified: %v", err)
			}
		})
	}
}

func TestMountedMetadataRejectsWrongAssemblyInput(t *testing.T) {
	cfg, text := mountedMetadataFixture(t, "")
	if err := os.WriteFile(cfg.MetadataGlob, []byte(strings.ReplaceAll(text, "a\t1\t1000", "other\t1\t1000")), 0600); err != nil {
		t.Fatal(err)
	}
	if db, err := openDuckDB(cfg); err == nil {
		db.Close()
		t.Fatal("accepted TSV missing an observed assembly")
	} else if !strings.Contains(err.Error(), "missing 1 assemblies") {
		t.Fatal(err)
	}
}

func TestMountedMetadataRejectsDuplicateAccessions(t *testing.T) {
	cfg, text := mountedMetadataFixture(t, "")
	if err := os.WriteFile(cfg.MetadataGlob, []byte(text+strings.Split(text, "\n")[1]+"\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if db, err := openDuckDB(cfg); err == nil {
		db.Close()
		t.Fatal("accepted duplicated assembly metadata")
	} else if !strings.Contains(err.Error(), "unique accession") {
		t.Fatal(err)
	}
}

func TestCompleteMetadataWithExistingSpeciesField(t *testing.T) {
	cfg, _ := mountedMetadataFixture(t, "")
	source, err := sql.Open("duckdb", cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = source.Exec("CREATE TABLE metadata_all AS SELECT * FROM metadata")
	source.Close()
	if err != nil {
		t.Fatal(err)
	}
	cfg.MetadataGlob = filepath.Join(t.TempDir(), "not-needed.tsv")
	db, err := openDuckDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rows, err := db.Query("SELECT * FROM metadata LIMIT 0")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, name := range columns {
		if strings.HasPrefix(name, "species_taxid") {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("species field duplicated: %v", columns)
	}
}

func TestMountedMetadataChecksPredictionTotal(t *testing.T) {
	cfg, _ := mountedMetadataFixture(t, "")
	source, err := sql.Open("duckdb", cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = source.Exec("UPDATE data_top_asm SET c=3")
	source.Close()
	if err != nil {
		t.Fatal(err)
	}
	if db, err := openDuckDB(cfg); err == nil {
		db.Close()
		t.Fatal("accepted prediction summaries that disagree with data_kpis")
	} else if !strings.Contains(err.Error(), "prediction summaries disagree") {
		t.Fatal(err)
	}
}

func TestMountedMetadataWithoutAssemblyCountTable(t *testing.T) {
	cfg, _ := mountedMetadataFixture(t, "")
	source, err := sql.Open("duckdb", cfg.DBPath)
	if err != nil {
		t.Fatal(err)
	}
	_, err = source.Exec("DROP TABLE data_top_asm; UPDATE metadata SET obs_n_zdna=2")
	source.Close()
	if err != nil {
		t.Fatal(err)
	}
	db, err := openDuckDB(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var n int64
	if err := db.QueryRow("SELECT SUM(obs_n_zdna)::BIGINT FROM metadata_all").Scan(&n); err != nil || n != 2 {
		t.Fatalf("mounted metadata counts unavailable: %d %v", n, err)
	}
}
