package main

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

func relationColumns(db *sql.DB, relation string) (map[string]bool, error) {
	rows, err := db.Query("SELECT * FROM " + relation + " LIMIT 0")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	result := make(map[string]bool, len(columns))
	for _, column := range columns {
		result[strings.ToLower(column)] = true
	}
	return result, nil
}

// An attached database can contain complete metadata_all, or a browser-only
// metadata table. Never write to the volume to adapt either stored schema.
func initializeMetadata(db *sql.DB, cfg *Config, names []string) error {
	has := make(map[string]bool, len(names))
	for _, name := range names {
		has[name] = true
	}
	columns, err := relationColumns(db, "zdb.main.metadata")
	if err != nil {
		return err
	}
	if has["metadata_all"] {
		if _, err := db.Exec("CREATE VIEW metadata_all AS SELECT * FROM zdb.main.metadata_all"); err != nil {
			return err
		}
		query := "CREATE VIEW metadata AS SELECT * FROM zdb.main.metadata"
		// Some stored schemas already include this field. Do not append it twice.
		if !columns["species_taxid"] {
			query = "CREATE VIEW metadata AS SELECT m.*, a.species_taxid FROM zdb.main.metadata m JOIN metadata_all a USING (assembly)"
		}
		_, err := db.Exec(query)
		return err
	}
	if strings.TrimSpace(cfg.MetadataGlob) == "" {
		return fmt.Errorf("database has no metadata_all; set METADATA_GLOB to its complete assembly metadata TSV (gzip supported)")
	}
	log.Printf("Database has no metadata_all; loading complete assembly attributes from %s", cfg.MetadataGlob)
	if err := buildRuntimeMetadata(db, cfg.MetadataGlob, columns, has["data_top_asm"]); err != nil {
		return err
	}
	_, err = db.Exec("CREATE VIEW metadata AS SELECT * FROM metadata_all WHERE obs_n_zdna > 0")
	return err
}

func buildRuntimeMetadata(db *sql.DB, path string, native map[string]bool, hasCounts bool) error {
	// File access is allowed only during initialization, before lockDownEngine.
	_, err := db.Exec("CREATE TEMP VIEW _assembly_source AS SELECT * FROM read_csv('" + sqlQuote(normalizePath(path)) + "', delim='\t', header=true, all_varchar=true)")
	if err != nil {
		return fmt.Errorf("reading METADATA_GLOB %q: %w", path, err)
	}
	source, err := relationColumns(db, "_assembly_source")
	if err != nil {
		return err
	}
	pick := func(names ...string) string {
		for _, name := range names {
			if source[strings.ToLower(name)] {
				return "NULLIF(s." + quoteIdent(name) + ", '')"
			}
		}
		return "NULL"
	}
	if pick("assembly", "assembly_accession") == "NULL" || pick("genome_size") == "NULL" || pick("species_taxid", "ncbi_species_taxid", "ncbi_summary_species_taxid") == "NULL" {
		return fmt.Errorf("METADATA_GLOB requires assembly/assembly_accession, genome_size and a species taxid column")
	}
	cast := func(kind string, names ...string) string { return "TRY_CAST(" + pick(names...) + " AS " + kind + ")" }
	fields := []string{
		pick("assembly", "assembly_accession") + " AS assembly",
		pick("bioproject") + "::VARCHAR AS bioproject", pick("biosample") + "::VARCHAR AS biosample",
		cast("BIGINT", "taxid", "ncbi_summary_taxid", "ncbi_taxid") + " AS taxid",
		"CASE LOWER(" + pick("assembly_level", "resolve_level") + ") WHEN 'complete' THEN 'Complete Genome' WHEN 'chromosome' THEN 'Chromosome' ELSE " + pick("assembly_level", "resolve_level") + " END AS assembly_level",
		cast("BIGINT", "genome_size") + " AS genome_size", cast("DOUBLE", "gc_percent") + " AS gc_percent",
	}
	for _, name := range []string{"superkingdom", "kingdom", "phylum", "class", "order", "family", "genus", "tax_name", "viral_realm", "updated_tax_name"} {
		fields = append(fields, pick(name)+"::VARCHAR AS "+quoteIdent(name))
	}
	fields = append(fields, "COALESCE("+cast("BOOLEAN", "is_t2t")+", false) AS is_t2t", cast("BIGINT", "species_taxid", "ncbi_summary_species_taxid", "ncbi_species_taxid")+" AS species_taxid")
	if _, err := db.Exec("CREATE TEMP TABLE _assembly_attributes AS SELECT " + strings.Join(fields, ", ") + " FROM _assembly_source s"); err != nil {
		return err
	}
	var rows, distinct int64
	if err := db.QueryRow("SELECT COUNT(*), COUNT(DISTINCT assembly) FROM _assembly_attributes").Scan(&rows, &distinct); err != nil {
		return err
	}
	if rows == 0 || rows != distinct {
		return fmt.Errorf("METADATA_GLOB must have one nonempty, unique accession per assembly")
	}
	count := "COALESCE(m.obs_n_zdna, 0)"
	joinCounts := ""
	observed := "zdb.main.metadata"
	key := "assembly"
	if hasCounts {
		count = "COALESCE(t.c, 0)"
		joinCounts = " LEFT JOIN zdb.main.data_top_asm t ON t.k = a.assembly"
		observed = "zdb.main.data_top_asm"
		key = "k"
	}
	var missing int64
	if err := db.QueryRow("SELECT COUNT(*) FROM " + observed + " m LEFT JOIN _assembly_attributes a ON a.assembly=m." + key + " WHERE a.assembly IS NULL").Scan(&missing); err != nil {
		return err
	}
	if missing > 0 {
		return fmt.Errorf("METADATA_GLOB is missing %d assemblies present in the mounted database", missing)
	}
	if !native["obs_zbp"] || !native["obs_n_zdna"] {
		return fmt.Errorf("mounted metadata requires obs_zbp and obs_n_zdna prediction summaries")
	}
	t2t := "a.is_t2t"
	if native["is_t2t"] {
		t2t = "COALESCE(m.is_t2t, a.is_t2t)"
	}
	// Counts come from the mounted database, never from stale TSV prediction fields.
	// Retain native observed base totals; missing/zero-prediction assemblies have 0.
	query := `CREATE TABLE metadata_all AS SELECT a.* EXCLUDE (is_t2t), ` + t2t + ` AS is_t2t,
  CASE WHEN ` + count + ` > 0 THEN m.obs_zbp ELSE 0 END::BIGINT AS obs_zbp,
  CASE WHEN a.genome_size > 0 THEN
    CASE WHEN ` + count + ` > 0 THEN m.obs_zbp ELSE 0 END::DOUBLE * 1000 / a.genome_size
  ELSE NULL END AS obs_density_per_kb,
  ` + count + `::BIGINT AS obs_n_zdna
  FROM _assembly_attributes a LEFT JOIN zdb.main.metadata m ON m.assembly=a.assembly` + joinCounts
	if _, err := db.Exec(query); err != nil {
		return err
	}
	var total, expected int64
	if err := db.QueryRow("SELECT COALESCE(SUM(obs_n_zdna), 0)::BIGINT, (SELECT total_sites FROM zdb.main.data_kpis LIMIT 1) FROM metadata_all").Scan(&total, &expected); err != nil {
		return err
	}
	if total != expected {
		return fmt.Errorf("mounted prediction summaries disagree: metadata=%d, data_kpis=%d", total, expected)
	}
	if _, err := db.Exec("DROP TABLE _assembly_attributes; DROP VIEW _assembly_source"); err != nil {
		return err
	}
	log.Printf("Assembly metadata ready: %d assemblies; %d mounted predictions", rows, total)
	return nil
}
