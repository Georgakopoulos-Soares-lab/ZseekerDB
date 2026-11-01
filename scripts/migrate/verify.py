"""Verify the rebuilt DuckDB: schema diff vs old, row counts, join orphans, and a
replay of the exact SQL each backend endpoint / frontend page issues.

Read-only.
"""
import duckdb
from common import DB_PATH, THREADS

# Expected schema (col_name, duckdb_type) captured from the OLD database.
EXPECTED = {
    "data": [("Chromosome","VARCHAR"),("Start","BIGINT"),("End","BIGINT"),("Z-DNA Score","FLOAT"),
             ("Sequence","VARCHAR"),("assembly","VARCHAR")],
    "metadata": [("assembly","VARCHAR"),("bioproject","VARCHAR"),("biosample","VARCHAR"),("taxid","BIGINT"),
                 ("assembly_level","VARCHAR"),("genome_size","BIGINT"),("gc_percent","DOUBLE"),
                 ("superkingdom","VARCHAR"),("kingdom","VARCHAR"),("phylum","VARCHAR"),("class","VARCHAR"),
                 ("order","VARCHAR"),("family","VARCHAR"),("genus","VARCHAR"),("tax_name","VARCHAR"),
                 ("is_t2t","BOOLEAN"),("viral_realm","VARCHAR"),("updated_tax_name","VARCHAR"),
                 ("obs_zbp","BIGINT"),("obs_density_per_kb","DOUBLE"),("obs_n_zdna","BIGINT")],
    "chromosomes": [("Chromosome","VARCHAR")],
    "tax_names": [("tax_name","VARCHAR")],
    "data_kpis": [("total_sites","BIGINT"),("distinct_chr","BIGINT"),("avg_score","DOUBLE"),
                  ("min_score","DOUBLE"),("max_score","DOUBLE"),("avg_seq_len","DOUBLE"),
                  ("distinct_asm","BIGINT"),("computed_at","TIMESTAMP WITH TIME ZONE")],
    "data_top_asm": [("k","VARCHAR"),("c","BIGINT")],
    "data_top_chrom": [("k","VARCHAR"),("c","BIGINT")],
    "zdna": [("Chromosome","VARCHAR"),("Start","BIGINT"),("End","BIGINT"),("Z-DNA Score","FLOAT"),
             ("Sequence","VARCHAR"),("Assembly","VARCHAR")],
    "metadata_view": [("assembly","VARCHAR"),("bioproject","VARCHAR"),("biosample","VARCHAR"),
                      ("T2T","BOOLEAN"),("Genome size","BIGINT"),("Taxon ID","BIGINT"),
                      ("GC content (%)","DOUBLE"),("superkingdom","VARCHAR"),("kingdom","VARCHAR"),
                      ("phylum","VARCHAR"),("class","VARCHAR"),("order","VARCHAR"),("family","VARCHAR"),
                      ("genus","VARCHAR"),("tax_name","VARCHAR"),("Viral realm","VARCHAR"),
                      ("Infraspecific name","VARCHAR"),("Z-DNA bps","BIGINT"),
                      ("Z-DNA density (per kb)","DOUBLE"),("Number of predicrions","BIGINT")],
}

EXPECTED["metadata_all"] = EXPECTED["metadata"] + [("species_taxid", "BIGINT")]


def describe(con, name):
    return [(r[0], r[1]) for r in con.execute(f"DESCRIBE {con.__class__ and '' or ''}\"{name}\"").fetchall()]


def check_schema(con):
    print("\n==== SCHEMA DIFF (expected vs actual) ====")
    ok = True
    existing = set(r[0] for r in con.execute(
        "SELECT table_name FROM information_schema.tables").fetchall())
    for name, exp in EXPECTED.items():
        if name not in existing:
            print(f"  MISSING OBJECT: {name}"); ok = False; continue
        act = [(r[0], r[1]) for r in con.execute(f'DESCRIBE "{name}"').fetchall()]
        if act == exp:
            print(f"  OK  {name} ({len(act)} cols)")
        else:
            ok = False
            print(f"  MISMATCH {name}:")
            print(f"     expected: {exp}")
            print(f"     actual:   {act}")
    print("SCHEMA:", "ALL OK" if ok else "DIFFERENCES FOUND")
    return ok


def counts(con):
    print("\n==== ROW COUNTS ====")
    for t in ["data","metadata","metadata_all","chromosomes","tax_names","data_kpis","data_top_asm","data_top_chrom"]:
        print(f"  {t}: {con.execute(f'SELECT COUNT(*) FROM \"{t}\"').fetchone()[0]:,}")


def joins(con):
    print("\n==== JOIN INTEGRITY ====")
    orphan_data = con.execute(
        "SELECT COUNT(DISTINCT d.assembly) FROM data d LEFT JOIN metadata m ON m.assembly=d.assembly WHERE m.assembly IS NULL").fetchone()[0]
    tot_asm = con.execute("SELECT COUNT(DISTINCT assembly) FROM data").fetchone()[0]
    meta_no_data = con.execute(
        "SELECT COUNT(*) FROM metadata m LEFT JOIN (SELECT DISTINCT assembly FROM data) d ON d.assembly=m.assembly WHERE d.assembly IS NULL").fetchone()[0]
    print(f"  data assemblies w/o metadata row: {orphan_data} / {tot_asm}")
    print(f"  metadata rows w/o any data:       {meta_no_data}")
    from os import environ
    return orphan_data == 0 and (meta_no_data == 0 or environ.get("MIG_DROP_EMPTY_ASSEMBLIES", "1") == "0")


def replay(con):
    print("\n==== ENDPOINT / FRONTEND SQL REPLAY ====")
    checks = [
        ("data_kpis (DataStats)", "SELECT * FROM data_kpis"),
        ("data_top_chrom top10", "SELECT k,c FROM data_top_chrom ORDER BY c DESC LIMIT 10"),
        ("data_top_asm top10", "SELECT k,c FROM data_top_asm ORDER BY c DESC LIMIT 10"),
        ("tax_names prefix", "SELECT tax_name AS label FROM tax_names WHERE lower(tax_name) LIKE 'esch%' ORDER BY 1 LIMIT 10"),
        ("home score histogram (sample)",
         "SELECT FLOOR(score/10)*10 bin, COUNT(*) n FROM (SELECT \"Z-DNA Score\" score FROM data USING SAMPLE 200000 ROWS) s GROUP BY 1 ORDER BY 1"),
        ("home scatter",
         "SELECT TRY_CAST(genome_size AS DOUBLE), TRY_CAST(gc_percent AS DOUBLE), COALESCE(superkingdom,'(unknown)') FROM metadata_all WHERE genome_size > 0 AND gc_percent IS NOT NULL USING SAMPLE 5000 ROWS"),
        ("metadata top classes",
         "SELECT \"class\" AS name, COUNT(*) AS value FROM metadata WHERE genome_size>=1000 GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12"),
        ("metadata assembly_level chart",
         "SELECT coalesce(assembly_level,'(unknown)') l, COUNT(*) n FROM metadata WHERE genome_size>=1000 GROUP BY 1 ORDER BY n DESC"),
        ("metadata distinct genus",
         "SELECT DISTINCT genus v FROM metadata WHERE genome_size>=1000 ORDER BY v NULLS LAST LIMIT 5"),
        ("metadata list page (aliased)",
         "SELECT assembly, taxid AS \"Taxon ID\", genome_size AS \"Genome size\", is_t2t AS \"T2T\", obs_zbp AS \"Z-DNA bps\", obs_density_per_kb AS \"Z-DNA density (per kb)\", obs_n_zdna AS \"Number of predictions\" FROM metadata WHERE genome_size>=1000 ORDER BY LOWER(tax_name) LIMIT 5"),
        ("zdna search", "SELECT \"Chromosome\",\"Start\",\"End\",\"Z-DNA Score\",\"Sequence\" FROM data WHERE \"Z-DNA Score\">=100 LIMIT 5"),
        ("zdna score histogram",
         "SELECT CAST(floor(\"Z-DNA Score\"/5)*5 AS INT) bin, COUNT(*) c FROM (SELECT \"Z-DNA Score\" FROM data USING SAMPLE 200000 ROWS) s GROUP BY 1 ORDER BY 1 LIMIT 10"),
        ("distinct_chr autocomplete", "SELECT \"Chromosome\" v FROM chromosomes WHERE LOWER(\"Chromosome\") LIKE 'cp%' LIMIT 10"),
        ("metadata_view sample", "SELECT * FROM metadata_view LIMIT 3"),
        ("zdna view sample", "SELECT * FROM zdna LIMIT 3"),
    ]
    import re
    from pathlib import Path
    backend = Path(__file__).resolve().parents[2] / 'backend' / 'home_queries.go'
    for name, query in re.findall(r'const (home\w+Query) = `([^`]+)`', backend.read_text()):
        checks.append((name, query))
    allok = True
    for label, sql in checks:
        try:
            rows = con.execute(sql).fetchall()
            print(f"  OK  {label}: {len(rows)} row(s); sample={rows[0] if rows else None}")
        except Exception as e:
            allok = False
            print(f"  FAIL {label}: {e!r}")
    print("REPLAY:", "ALL OK" if allok else "FAILURES")
    return allok


def check_metadata(con):
    from common import META_TSV
    path = META_TSV.replace("'", "''")
    source_count, source_unique = con.execute(f"SELECT COUNT(*), COUNT(DISTINCT assembly) FROM read_csv('{path}', delim='\t', header=true, all_varchar=true)").fetchone()
    n, unique = con.execute('SELECT COUNT(*), COUNT(DISTINCT assembly) FROM metadata_all').fetchone()
    total = con.execute('SELECT SUM(n) FROM (SELECT COUNT(*) n FROM metadata_all GROUP BY superkingdom)').fetchone()[0]
    actual = con.execute('SELECT COUNT(*) FROM data').fetchone()[0]
    reported = con.execute('SELECT SUM(obs_n_zdna) FROM metadata_all').fetchone()[0]
    print(f"metadata_all rows={n}, unique={unique}, TSV rows={source_count}, TSV unique={source_unique}, superkingdom sum={total}")
    print(f"prediction records={actual}, metadata prediction sum={reported}")
    valid_coordinates = con.execute('SELECT COUNT(*) FROM (SELECT * FROM data USING SAMPLE 10000 ROWS) s WHERE "Start" < 0 OR "End" < "Start" OR length("Sequence") != "End"-"Start"+1 OR "Start" IS NULL OR "End" IS NULL OR "Sequence" IS NULL').fetchone()[0] == 0
    return n == unique == source_count == source_unique == total and actual == reported and valid_coordinates


def main():
    from pathlib import Path
    if not Path(DB_PATH).is_file():
        raise SystemExit(f"Database does not exist: {DB_PATH}")
    con = duckdb.connect(DB_PATH, read_only=True)
    con.execute(f"PRAGMA threads={THREADS}")
    s = check_schema(con)
    if not s:
        con.close()
        raise SystemExit("Incomplete or incompatible schema; full database verification cannot proceed")
    counts(con)
    j = joins(con)
    m = check_metadata(con)
    r = replay(con)
    print("\n==== SUMMARY ====")
    print("schema:", "OK" if s else "DIFF", " replay:", "OK" if r else "FAIL")
    con.close()
    if not (s and j and m and r):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
