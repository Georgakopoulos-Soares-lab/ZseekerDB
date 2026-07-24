"""Build metadata, chromosomes, tax_names, stat tables, and views.

Run AFTER build_data.py has fully populated `data`.

Column mapping (new TSV -> old metadata schema) and stat logic are documented in the
migration plan. is_t2t is best-effort: true if any source CSV filename for the assembly
contains 'T2T' (case-insensitive).
"""
import os
import re
import glob
import time
from common import connect, CSV_DIR, META_TSV, ACCESSION_RE, LOG_DIR

rx = re.compile(ACCESSION_RE)
LOG = os.path.join(LOG_DIR, "build_meta_stats.log")
FORCE = os.environ.get("MIG_FORCE", "0") == "1"


def have(con, name):
    """True if a non-empty base table `name` already exists (idempotent resume)."""
    if FORCE:
        return False
    try:
        n = con.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_name=?", [name]).fetchone()[0]
        if not n:
            return False
        return con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] > 0
    except Exception:
        return False


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def build_t2t_map(con):
    """assembly -> is_t2t (True if any of its source filenames contains 'T2T')."""
    t2t = {}
    for p in glob.iglob(os.path.join(CSV_DIR, "*.zseeker.csv")):
        base = os.path.basename(p)
        m = rx.match(base)
        if not m:
            continue
        a = m.group(1)
        flag = "T2T" in base.upper()
        t2t[a] = t2t.get(a, False) or flag
    con.execute("CREATE OR REPLACE TABLE _asm_t2t (assembly VARCHAR, is_t2t BOOLEAN)")
    con.executemany("INSERT INTO _asm_t2t VALUES (?, ?)", list(t2t.items()))
    n_t2t = sum(1 for v in t2t.values() if v)
    log(f"_asm_t2t built: {len(t2t)} assemblies, {n_t2t} flagged T2T")


def build_metadata(con):
    t = lambda c: f"nullif({c},'')"  # empty string -> NULL for text cols
    con.execute(f"""
    CREATE OR REPLACE TABLE metadata AS
    SELECT
        m.assembly                                        AS assembly,
        CAST(NULL AS VARCHAR)                             AS bioproject,
        CAST(NULL AS VARCHAR)                             AS biosample,
        TRY_CAST(m.ncbi_taxid AS BIGINT)                  AS taxid,
        {t('m.resolve_level')}                            AS assembly_level,
        TRY_CAST(m.genome_size AS BIGINT)                 AS genome_size,
        TRY_CAST(m.gc_percent AS DOUBLE)                  AS gc_percent,
        {t('m.superkingdom')}                             AS superkingdom,
        {t('m.kingdom')}                                  AS kingdom,
        {t('m.phylum')}                                   AS phylum,
        {t('m.class')}                                    AS class,
        {t('m."order"')}                                  AS "order",
        {t('m.family')}                                   AS family,
        {t('m.genus')}                                    AS genus,
        {t('m.tax_name')}                                 AS tax_name,
        COALESCE(z.is_t2t, false)                         AS is_t2t,
        {t('m.viral_realm')}                              AS viral_realm,
        {t('m.updated_tax_name')}                         AS updated_tax_name,
        TRY_CAST(m."Z-DNA/-RNA bases count" AS BIGINT)    AS obs_zbp,
        TRY_CAST(m."Z-DNA/-RNA density per kb" AS DOUBLE) AS obs_density_per_kb,
        TRY_CAST(m."Z-DNA/-RNA predictions count" AS BIGINT) AS obs_n_zdna
    FROM read_csv('{META_TSV}', delim='\t', header=true, all_varchar=true) m
    LEFT JOIN _asm_t2t z ON z.assembly = m.assembly
    """)
    n = con.execute("SELECT COUNT(*) FROM metadata").fetchone()[0]
    log(f"metadata built: {n} rows")


def build_aux(con):
    if have(con, "chromosomes"):
        log("chromosomes exists -> skip")
    else:
        con.execute('CREATE OR REPLACE TABLE chromosomes AS SELECT DISTINCT "Chromosome" FROM data')
        log("chromosomes built: %d" % con.execute("SELECT COUNT(*) FROM chromosomes").fetchone()[0])
    if have(con, "tax_names"):
        log("tax_names exists -> skip")
    else:
        con.execute("CREATE OR REPLACE TABLE tax_names AS SELECT DISTINCT tax_name FROM metadata WHERE genome_size >= 1000")
        log("tax_names built: %d" % con.execute("SELECT COUNT(*) FROM tax_names").fetchone()[0])


def build_stats(con):
    if have(con, "data_kpis"):
        log("data_kpis exists -> skip")
    else:
        con.execute("""
    CREATE OR REPLACE TABLE data_kpis AS
    SELECT
        COUNT(*)                       AS total_sites,
        COUNT(DISTINCT "Chromosome")   AS distinct_chr,
        AVG("Z-DNA Score")             AS avg_score,
        MIN("Z-DNA Score")             AS min_score,
        MAX("Z-DNA Score")             AS max_score,
        AVG(LENGTH("Sequence"))        AS avg_seq_len,
        COUNT(DISTINCT assembly)       AS distinct_asm,
        now()                          AS computed_at
    FROM data
    """)
        log("data_kpis built")
    # No ORDER BY here: the frontend applies `ORDER BY c DESC LIMIT 10` at query time
    # (DataStats.tsx), so pre-sorting these giant groupings only adds a memory-spiking
    # sort (29M distinct chromosomes) with no functional benefit.
    if have(con, "data_top_asm"):
        log("data_top_asm exists -> skip")
    else:
        con.execute('CREATE OR REPLACE TABLE data_top_asm AS SELECT assembly AS k, COUNT(*) AS c FROM data GROUP BY 1')
        log("data_top_asm rows=%d" % con.execute("SELECT COUNT(*) FROM data_top_asm").fetchone()[0])
    if have(con, "data_top_chrom"):
        log("data_top_chrom exists -> skip")
    else:
        con.execute('CREATE OR REPLACE TABLE data_top_chrom AS SELECT "Chromosome" AS k, COUNT(*) AS c FROM data GROUP BY 1')
        log("data_top_chrom rows=%d" % con.execute("SELECT COUNT(*) FROM data_top_chrom").fetchone()[0])


def build_views(con):
    # zdna view exactly as backend/main.go createOrReplaceViews (main.go:130)
    con.execute("""
    CREATE OR REPLACE VIEW zdna AS
    SELECT "Chromosome","Start","End","Z-DNA Score","Sequence", assembly AS "Assembly" FROM data
    """)
    # metadata_view: renamed display columns matching the old schema (typo 'predicrions' preserved)
    con.execute("""
    CREATE OR REPLACE VIEW metadata_view AS
    SELECT
        assembly, bioproject, biosample,
        is_t2t             AS "T2T",
        genome_size        AS "Genome size",
        taxid              AS "Taxon ID",
        gc_percent         AS "GC content (%)",
        superkingdom, kingdom, phylum, class, "order", family, genus, tax_name,
        viral_realm        AS "Viral realm",
        updated_tax_name   AS "Infraspecific name",
        obs_zbp            AS "Z-DNA bps",
        obs_density_per_kb AS "Z-DNA density (per kb)",
        obs_n_zdna         AS "Number of predicrions"
    FROM metadata WHERE genome_size >= 1000
    """)
    log("views zdna + metadata_view created")


def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    con = connect()
    ndata = con.execute("SELECT COUNT(*) FROM data").fetchone()[0]
    assert ndata > 0, "data table empty - run build_data.py first"
    log(f"data rows present: {ndata}")
    if have(con, "metadata"):
        log("metadata exists -> skip (t2t map + metadata)")
    else:
        build_t2t_map(con)
        build_metadata(con)
    build_aux(con)
    build_stats(con)
    build_views(con)
    con.execute("DROP TABLE IF EXISTS _asm_t2t")
    log("DONE build_meta_stats")
    con.close()


if __name__ == "__main__":
    main()
