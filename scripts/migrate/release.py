"""Shared build steps for the Oct-2026 release: metadata mapping, derived tables, views.

Used by both rebuild_release.py (from the July DB) and build_meta_stats.py (from scratch),
so the two paths produce the same objects.

metadata keeps the column names the backend/frontend already query (taxid, assembly_level,
obs_*, is_t2t, ...). bioproject/biosample are dropped: the new TSV has no source for them and
nothing in the app reads them. New TSV fields are appended after the legacy columns.
"""
import glob
import os
import re

from common import ACCESSION_RE, CSV_DIR

# Assemblies whose metadata says they have no predictions are dropped when this is set.
DROP_EMPTY = os.environ.get("MIG_DROP_EMPTY_ASSEMBLIES", "1") == "1"


def _q(s):
    return "'" + s.replace("'", "''") + "'"


def build_t2t_table(con, log):
    """_asm_t2t(assembly, is_t2t): True if any source CSV filename for the assembly contains 'T2T'."""
    rx = re.compile(ACCESSION_RE)
    t2t = {}
    for p in glob.iglob(os.path.join(CSV_DIR, "*.zseeker.csv")):
        base = os.path.basename(p)
        m = rx.match(base)
        if m:
            a = m.group(1)
            t2t[a] = t2t.get(a, False) or "T2T" in base.upper()
    assert t2t, f"no *.zseeker.csv files found in {CSV_DIR}"
    con.execute("CREATE OR REPLACE TEMP TABLE _asm_t2t (assembly VARCHAR, is_t2t BOOLEAN)")
    con.executemany("INSERT INTO _asm_t2t VALUES (?, ?)", list(t2t.items()))
    log(f"_asm_t2t: {len(t2t)} assemblies, {sum(t2t.values())} flagged T2T")


def build_metadata(con, meta_tsv, log):
    """metadata from the Oct-2026 TSV. Requires _asm_t2t (build_t2t_table)."""
    t = lambda c: f"nullif(m.{c},'')"
    na = lambda c: f"nullif(nullif(m.{c},''),'na')"
    big = lambda c: f"TRY_CAST(m.{c} AS BIGINT)"
    where = "WHERE TRY_CAST(m.z_predictions_count AS BIGINT) > 0" if DROP_EMPTY else ""
    con.execute(f"""
    CREATE OR REPLACE TABLE metadata AS
    SELECT
        m.assembly_accession                      AS assembly,
        {big('ncbi_summary_taxid')}               AS taxid,
        -- old DB carried NCBI assembly_level values; the TSV's resolve_level uses lowercase codes
        CASE m.resolve_level WHEN 'complete' THEN 'Complete Genome'
                             WHEN 'chromosome' THEN 'Chromosome'
                             ELSE {t('resolve_level')} END AS assembly_level,
        {big('genome_size')}                      AS genome_size,
        TRY_CAST(m.gc_percent AS DOUBLE)          AS gc_percent,
        {t('superkingdom')}                       AS superkingdom,
        {t('kingdom')}                            AS kingdom,
        {t('phylum')}                             AS phylum,
        {t('class')}                              AS class,
        {t('"order"')}                            AS "order",
        {t('family')}                             AS family,
        {t('genus')}                              AS genus,
        {t('tax_name')}                           AS tax_name,
        COALESCE(z.is_t2t, false)                 AS is_t2t,
        {t('viral_realm')}                        AS viral_realm,
        {t('updated_tax_name')}                   AS updated_tax_name,
        {big('total_z_bases')}                    AS obs_zbp,
        -- TSV z_density is a fraction (total_z_bases / genome_size_manual); app shows per kb
        TRY_CAST(m.z_density AS DOUBLE) * 1000    AS obs_density_per_kb,
        {big('z_predictions_count')}              AS obs_n_zdna,
        {big('ncbi_summary_species_taxid')}       AS species_taxid,
        {t('organism_name')}                      AS organism_name,
        {t('species')}                            AS species,
        {na('infraspecific_name')}                AS infraspecific_name,
        {big('genome_size_ungapped')}             AS genome_size_ungapped,
        {big('genome_size_manual')}               AS genome_size_manual,
        {big('replicon_count')}                   AS replicon_count,
        {big('scaffold_count')}                   AS scaffold_count,
        {big('contig_count')}                     AS contig_count,
        TRY_CAST(m.reference_genome AS BOOLEAN)   AS reference_genome,
        TRY_CAST(m.has_gff AS BOOLEAN)            AS has_gff,
        {na('paired_asm_comp')}                   AS paired_asm_comp
    FROM read_csv({_q(meta_tsv)}, delim='\t', header=true, all_varchar=true) m
    LEFT JOIN _asm_t2t z ON z.assembly = m.assembly_accession
    {where}
    ORDER BY m.assembly_accession
    """)
    n = con.execute("SELECT COUNT(*) FROM metadata").fetchone()[0]
    log(f"metadata built: {n:,} rows (drop_empty={DROP_EMPTY})")


def build_derived(con, log):
    """chromosomes, tax_names, data_kpis, data_top_asm, data_top_chrom. `data` holds only real predictions."""
    # One 29M-group aggregation feeds both chromosomes and data_top_chrom. No ORDER BY: the
    # frontend sorts at query time, and the sort OOM'd in the July build.
    con.execute('CREATE OR REPLACE TABLE data_top_chrom AS SELECT "Chromosome" AS k, COUNT(*) AS c FROM data GROUP BY 1')
    con.execute('CREATE OR REPLACE TABLE chromosomes AS SELECT k AS "Chromosome" FROM data_top_chrom')
    log("data_top_chrom / chromosomes: %d" % con.execute("SELECT COUNT(*) FROM chromosomes").fetchone()[0])

    con.execute("CREATE OR REPLACE TABLE data_top_asm AS SELECT assembly AS k, COUNT(*) AS c FROM data GROUP BY 1")
    log("data_top_asm: %d" % con.execute("SELECT COUNT(*) FROM data_top_asm").fetchone()[0])

    # Species pickers only offer species that have predictions.
    con.execute("""CREATE OR REPLACE TABLE tax_names AS
        SELECT DISTINCT tax_name FROM metadata WHERE genome_size >= 1000 AND obs_n_zdna > 0""")
    log("tax_names: %d" % con.execute("SELECT COUNT(*) FROM tax_names").fetchone()[0])

    con.execute("""
    CREATE OR REPLACE TABLE data_kpis AS
    SELECT
        s.total_sites,
        (SELECT COUNT(*) FROM chromosomes)  AS distinct_chr,
        s.avg_score, s.min_score, s.max_score, s.avg_seq_len,
        (SELECT COUNT(*) FROM data_top_asm) AS distinct_asm,
        now()                               AS computed_at
    FROM (
        SELECT COUNT(*)                                 AS total_sites,
               AVG("Z-DNA Score")                       AS avg_score,
               CAST(MIN("Z-DNA Score") AS DOUBLE)       AS min_score,
               CAST(MAX("Z-DNA Score") AS DOUBLE)       AS max_score,
               AVG(LENGTH("Sequence"))                  AS avg_seq_len
        FROM data) s
    """)
    log("data_kpis: %s" % (con.execute("SELECT * FROM data_kpis").fetchone(),))


def build_views(con, log):
    # zdna exactly as backend/main.go createOrReplaceViews
    con.execute("""
    CREATE OR REPLACE VIEW zdna AS
    SELECT "Chromosome","Start","End","Z-DNA Score","Sequence", assembly AS "Assembly" FROM data
    """)
    # Same display names as the old DB's metadata_view (typo 'predicrions' kept for compatibility).
    con.execute("""
    CREATE OR REPLACE VIEW metadata_view AS
    SELECT
        assembly,
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
