"""Verify the release DuckDB: schema, data invariants, metadata/data consistency, and a replay
of the SQL the backend endpoints and frontend pages issue.

Read-only. Exits non-zero if any check fails.

    python3 verify.py [db_path]
"""
import sys

import duckdb
from common import DB_PATH, META_TSV, MEM_GB, THREADS, TMP_DIR

EXPECTED = {
    "data": [("Chromosome", "VARCHAR"), ("Start", "BIGINT"), ("End", "BIGINT"), ("Z-DNA Score", "FLOAT"),
             ("Sequence", "VARCHAR"), ("assembly", "VARCHAR")],
    "metadata": [("assembly", "VARCHAR"), ("taxid", "BIGINT"), ("assembly_level", "VARCHAR"),
                 ("genome_size", "BIGINT"), ("gc_percent", "DOUBLE"), ("superkingdom", "VARCHAR"),
                 ("kingdom", "VARCHAR"), ("phylum", "VARCHAR"), ("class", "VARCHAR"), ("order", "VARCHAR"),
                 ("family", "VARCHAR"), ("genus", "VARCHAR"), ("tax_name", "VARCHAR"), ("is_t2t", "BOOLEAN"),
                 ("viral_realm", "VARCHAR"), ("updated_tax_name", "VARCHAR"), ("obs_zbp", "BIGINT"),
                 ("obs_density_per_kb", "DOUBLE"), ("obs_n_zdna", "BIGINT"),
                 ("species_taxid", "BIGINT"), ("organism_name", "VARCHAR"), ("species", "VARCHAR"),
                 ("infraspecific_name", "VARCHAR"), ("genome_size_ungapped", "BIGINT"),
                 ("genome_size_manual", "BIGINT"), ("replicon_count", "BIGINT"), ("scaffold_count", "BIGINT"),
                 ("contig_count", "BIGINT"), ("reference_genome", "BOOLEAN"), ("has_gff", "BOOLEAN"),
                 ("paired_asm_comp", "VARCHAR")],
    "chromosomes": [("Chromosome", "VARCHAR")],
    "tax_names": [("tax_name", "VARCHAR")],
    "data_kpis": [("total_sites", "BIGINT"), ("distinct_chr", "BIGINT"), ("avg_score", "DOUBLE"),
                  ("min_score", "DOUBLE"), ("max_score", "DOUBLE"), ("avg_seq_len", "DOUBLE"),
                  ("distinct_asm", "BIGINT"), ("computed_at", "TIMESTAMP WITH TIME ZONE")],
    "data_top_asm": [("k", "VARCHAR"), ("c", "BIGINT")],
    "data_top_chrom": [("k", "VARCHAR"), ("c", "BIGINT")],
    "zdna": [("Chromosome", "VARCHAR"), ("Start", "BIGINT"), ("End", "BIGINT"), ("Z-DNA Score", "FLOAT"),
             ("Sequence", "VARCHAR"), ("Assembly", "VARCHAR")],
    "metadata_view": [("assembly", "VARCHAR"), ("T2T", "BOOLEAN"), ("Genome size", "BIGINT"),
                      ("Taxon ID", "BIGINT"), ("GC content (%)", "DOUBLE"), ("superkingdom", "VARCHAR"),
                      ("kingdom", "VARCHAR"), ("phylum", "VARCHAR"), ("class", "VARCHAR"), ("order", "VARCHAR"),
                      ("family", "VARCHAR"), ("genus", "VARCHAR"), ("tax_name", "VARCHAR"),
                      ("Viral realm", "VARCHAR"), ("Infraspecific name", "VARCHAR"), ("Z-DNA bps", "BIGINT"),
                      ("Z-DNA density (per kb)", "DOUBLE"), ("Number of predicrions", "BIGINT")],
}

failures = []


def check(label, ok, detail=""):
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{': ' + str(detail) if detail != '' else ''}", flush=True)
    if not ok:
        failures.append(label)


def one(con, sql):
    return con.execute(sql).fetchone()


def check_schema(con):
    print("\n==== SCHEMA ====")
    existing = {r[0] for r in con.execute("SELECT table_name FROM information_schema.tables").fetchall()}
    for name, exp in EXPECTED.items():
        if name not in existing:
            check(name, False, "missing")
            continue
        act = [(r[0], r[1]) for r in con.execute(f'DESCRIBE "{name}"').fetchall()]
        check(name, act == exp, f"{len(act)} cols" if act == exp else f"expected {exp}\n       actual   {act}")
    extra = existing - set(EXPECTED)
    check("no unexpected objects", not extra, sorted(extra) if extra else "")


def check_data(con):
    print("\n==== DATA INVARIANTS (full scan) ====")
    con.execute("""
        CREATE TEMP TABLE _asm AS
        SELECT assembly,
               COUNT(*)                                       AS n,
               SUM("End" - "Start" + 1)                       AS bases,
               COUNT(*) FILTER (WHERE "Chromosome" IS NULL OR "Start" IS NULL OR "End" IS NULL
                                   OR "Z-DNA Score" IS NULL OR "Sequence" IS NULL) AS nulls,
               COUNT(*) FILTER (WHERE "End" < "Start")        AS inverted,
               COUNT(*) FILTER (WHERE LENGTH("Sequence") <> "End" - "Start" + 1) AS len_mismatch
        FROM data GROUP BY 1""")
    nulls, inverted, len_mm, null_asm = one(con, """SELECT SUM(nulls), SUM(inverted), SUM(len_mismatch),
        COUNT(*) FILTER (WHERE assembly IS NULL) FROM _asm""")
    check("no NULL / placeholder rows", nulls == 0, nulls)
    check("no NULL assembly", null_asm == 0, null_asm)
    check("End >= Start", inverted == 0, inverted)
    check("len(Sequence) == End-Start+1", len_mm == 0, len_mm)


def check_consistency(con):
    print("\n==== METADATA <-> DATA ====")
    tsv_total, tsv_nonempty, tsv_preds = one(con, f"""
        SELECT COUNT(*), COUNT(*) FILTER (WHERE z_predictions_count > 0), SUM(z_predictions_count)
        FROM read_csv('{META_TSV}', delim='\t', header=true, sample_size=-1)""")
    n_meta, = one(con, "SELECT COUNT(*) FROM metadata")
    print(f"  TSV rows={tsv_total:,}  with predictions={tsv_nonempty:,}  predictions={tsv_preds:,}")
    check("metadata rows == TSV assemblies with predictions", n_meta == tsv_nonempty, f"{n_meta:,}")
    check("metadata.assembly unique", one(con, "SELECT COUNT(DISTINCT assembly) FROM metadata")[0] == n_meta)
    n_data, = one(con, "SELECT COUNT(*) FROM data")
    check("data rows == TSV predictions", n_data == tsv_preds, f"{n_data:,}")
    check("no metadata rows with obs_n_zdna = 0", one(con, "SELECT COUNT(*) FROM metadata WHERE obs_n_zdna <= 0")[0] == 0)
    check("data assemblies without metadata",
          one(con, "SELECT COUNT(*) FROM _asm a ANTI JOIN metadata m ON m.assembly = a.assembly")[0] == 0)
    check("metadata assemblies without data",
          one(con, "SELECT COUNT(*) FROM metadata m ANTI JOIN _asm a ON a.assembly = m.assembly")[0] == 0)
    mm = one(con, """SELECT COUNT(*) FILTER (WHERE a.n <> m.obs_n_zdna), COUNT(*) FILTER (WHERE a.bases <> m.obs_zbp)
                     FROM metadata m JOIN _asm a USING (assembly)""")
    check("per-assembly count == obs_n_zdna", mm[0] == 0, mm[0])
    check("per-assembly bases == obs_zbp", mm[1] == 0, mm[1])
    dens, = one(con, """SELECT MAX(ABS(obs_density_per_kb - obs_zbp * 1000.0 / genome_size_manual))
                        FROM metadata""")
    check("obs_density_per_kb == obs_zbp/genome_size_manual*1000", dens is not None and dens < 1e-6, dens)
    check("data_top_asm matches data",
          one(con, "SELECT COUNT(*) FROM data_top_asm t FULL JOIN _asm a ON a.assembly = t.k WHERE t.c IS DISTINCT FROM a.n")[0] == 0)
    kp = one(con, "SELECT total_sites, distinct_chr, distinct_asm FROM data_kpis")
    check("data_kpis totals", kp == (n_data, one(con, "SELECT COUNT(*) FROM chromosomes")[0], n_meta), kp)
    check("data_top_chrom sums to data rows", one(con, "SELECT SUM(c) FROM data_top_chrom")[0] == n_data)
    check("tax_names all have predictions",
          one(con, "SELECT COUNT(*) FROM tax_names t ANTI JOIN metadata m USING (tax_name)")[0] == 0)
    check("genome_size >= 1000 everywhere", one(con, "SELECT COUNT(*) FROM metadata WHERE genome_size < 1000")[0] == 0)


def replay(con):
    print("\n==== ENDPOINT / FRONTEND SQL REPLAY ====")
    checks = [
        ("data_kpis (DataStats)", "SELECT * FROM data_kpis"),
        ("data_top_chrom top10", "SELECT k, c FROM data_top_chrom ORDER BY c DESC LIMIT 10"),
        ("data_top_asm top10", "SELECT k, c FROM data_top_asm ORDER BY c DESC LIMIT 10"),
        ("tax_names prefix", "SELECT tax_name AS label FROM tax_names WHERE lower(tax_name) LIKE 'esch%' ORDER BY 1 LIMIT 10"),
        ("home KPIs", "SELECT COUNT(*), COUNT(DISTINCT taxid), AVG(TRY_CAST(genome_size AS DOUBLE)), "
                      "AVG(TRY_CAST(gc_percent AS DOUBLE)) FROM metadata WHERE genome_size >= 1000"),
        ("home superkingdoms", "SELECT COALESCE(superkingdom,'(unknown)') AS label, COUNT(*) AS n FROM metadata "
                               "WHERE genome_size >= 1000 GROUP BY 1 ORDER BY n DESC"),
        ("home top kingdoms (taxid-balanced)", """
            WITH per_taxid AS (
                SELECT kingdom, taxid, AVG(TRY_CAST(obs_density_per_kb AS DOUBLE)) AS taxid_density,
                       COUNT(*) AS assembly_count, COALESCE(MAX(superkingdom), '(unknown)') AS superkingdom
                FROM metadata
                WHERE kingdom IS NOT NULL AND kingdom <> '' AND taxid IS NOT NULL
                  AND obs_density_per_kb IS NOT NULL AND genome_size >= 1000
                GROUP BY kingdom, taxid)
            SELECT kingdom AS label, AVG(taxid_density) AS density, SUM(assembly_count), COUNT(*),
                   COALESCE(MAX(superkingdom), '(unknown)') FROM per_taxid GROUP BY kingdom ORDER BY density DESC LIMIT 10"""),
        ("home score histogram (sample)", 'SELECT FLOOR(score/10)*10 AS bin, COUNT(*) AS n FROM '
                                          '(SELECT "Z-DNA Score" AS score FROM data USING SAMPLE 200000 ROWS) s GROUP BY 1 ORDER BY 1'),
        ("home scatter", "SELECT TRY_CAST(genome_size AS DOUBLE), TRY_CAST(gc_percent AS DOUBLE), "
                         "COALESCE(superkingdom,'(unknown)') FROM metadata WHERE genome_size IS NOT NULL "
                         "AND gc_percent IS NOT NULL AND genome_size >= 1000 USING SAMPLE 5000 ROWS"),
        ("metadata top classes", 'SELECT "class" AS name, COUNT(*) AS value FROM metadata WHERE genome_size >= 1000 '
                                 'GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12'),
        ("assembly levels", "SELECT coalesce(assembly_level,'(unknown)') AS label, COUNT(*) AS n FROM metadata "
                            "WHERE genome_size >= 1000 GROUP BY 1 ORDER BY n DESC"),
        ("taxonomy drill-down", 'SELECT superkingdom, viral_realm, kingdom, phylum, class, "order", family, genus, '
                                'tax_name, taxid, COUNT(*) AS assembly_count FROM metadata WHERE genome_size >= 1000 '
                                'GROUP BY 1,2,3,4,5,6,7,8,9,10'),
        ("metadata distinct genus", "SELECT DISTINCT genus AS v FROM metadata WHERE genome_size >= 1000 ORDER BY v NULLS LAST LIMIT 5"),
        ("metadata ungapped range filter", "SELECT COUNT(*) FROM metadata WHERE genome_size >= 1000 AND genome_size_ungapped >= 5000000"),
        ("zdna search", 'SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" FROM data WHERE "Z-DNA Score" >= 100 LIMIT 5'),
        ("zdna score histogram", 'SELECT CAST(floor("Z-DNA Score" / 5) * 5 AS INT) AS bin, COUNT(*) AS count '
                                 'FROM data USING SAMPLE 200000 ROWS GROUP BY 1 ORDER BY 1'),
        ("zdna by assembly (Explorer)", "SELECT COUNT(*) FROM data WHERE assembly = 'GCF_000005845.2'"),
        ("distinct_chr autocomplete", "SELECT \"Chromosome\" AS v FROM chromosomes WHERE LOWER(\"Chromosome\") LIKE 'cp%' LIMIT 10"),
        ("distinct_assembly autocomplete", "SELECT assembly AS v FROM metadata WHERE LOWER(assembly) LIKE 'gcf_0000058%' "
                                           "ORDER BY assembly LIMIT 10"),
        ("metadata_view sample", "SELECT * FROM metadata_view LIMIT 3"),
        ("zdna view sample", "SELECT * FROM zdna LIMIT 3"),
    ]
    for label, sql in checks:
        try:
            rows = con.execute(sql).fetchall()
            check(label, bool(rows), f"{len(rows)} row(s); first={rows[0] if rows else None}")
        except Exception as e:
            check(label, False, repr(e))


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else DB_PATH
    print("verifying", db)
    con = duckdb.connect(db, read_only=True)
    con.execute(f"PRAGMA threads={THREADS}")
    con.execute(f"PRAGMA memory_limit='{MEM_GB}GB'")
    con.execute(f"PRAGMA temp_directory='{TMP_DIR}'")
    check_schema(con)
    check_data(con)
    check_consistency(con)
    replay(con)
    con.close()
    print("\n==== SUMMARY ====")
    print("ALL CHECKS PASSED" if not failures else f"{len(failures)} FAILED: {failures}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
