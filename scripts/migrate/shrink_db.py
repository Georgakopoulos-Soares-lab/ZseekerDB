"""One-time space reduction on the built DuckDB, writing a fresh compact file:
  * DROP the unused `Chromosome_alt` column from `data` (pure duplicate of Chromosome)
  * CAST `Z-DNA Score` DOUBLE -> FLOAT (verified lossless: scores are .25 multiples < 2^22)

Copies every object into a NEW file (so freed space is actually reclaimed on disk;
DuckDB never shrinks a file in place). Internal build tables (_ingest_state, _asm_t2t)
are intentionally dropped.
"""
import os
import time

import duckdb
from common import TMP_DIR

OLD = "/scratch/10899/kimopro/ZSeekerDB_migration/zdnadatabase.duckdb"
NEW = "/scratch/10899/kimopro/ZSeekerDB_migration/zdnadatabase_shrunk.duckdb"


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main():
    if os.path.exists(NEW):
        os.remove(NEW)
    con = duckdb.connect(NEW)
    con.execute("PRAGMA threads=4")
    con.execute(f"PRAGMA temp_directory='{TMP_DIR}'")
    con.execute("PRAGMA max_temp_directory_size='500GB'")
    con.execute("PRAGMA memory_limit='12GB'")
    con.execute(f"ATTACH '{OLD}' AS old (READ_ONLY)")

    log("copying data (drop Chromosome_alt, Z-DNA Score -> FLOAT) ...")
    t = time.time()
    con.execute('''CREATE TABLE data AS
        SELECT "Chromosome", "Start", "End",
               CAST("Z-DNA Score" AS FLOAT) AS "Z-DNA Score",
               "Sequence", assembly
        FROM old.data''')
    log(f"data copied in {time.time()-t:.0f}s: {con.execute('SELECT COUNT(*) FROM data').fetchone()[0]:,} rows")

    for tbl in ["metadata", "chromosomes", "tax_names", "data_kpis", "data_top_asm", "data_top_chrom"]:
        con.execute(f'CREATE TABLE {tbl} AS SELECT * FROM old.{tbl}')
        log(f"{tbl}: {con.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0]:,}")

    # views (Z-DNA Score is FLOAT now; everything else identical)
    con.execute('''CREATE OR REPLACE VIEW zdna AS
        SELECT "Chromosome","Start","End","Z-DNA Score","Sequence", assembly AS "Assembly" FROM data''')
    con.execute('''CREATE OR REPLACE VIEW metadata_view AS
        SELECT assembly, bioproject, biosample, is_t2t AS "T2T", genome_size AS "Genome size",
               taxid AS "Taxon ID", gc_percent AS "GC content (%)",
               superkingdom, kingdom, phylum, class, "order", family, genus, tax_name,
               viral_realm AS "Viral realm", updated_tax_name AS "Infraspecific name",
               obs_zbp AS "Z-DNA bps", obs_density_per_kb AS "Z-DNA density (per kb)",
               obs_n_zdna AS "Number of predicrions"
        FROM metadata WHERE genome_size >= 1000''')

    con.execute("CHECKPOINT")
    con.execute("DETACH old")
    con.close()
    log(f"DONE -> {NEW}")
    log("old=%.1f GiB  new=%.1f GiB" % (
        os.path.getsize(OLD) / 2**30, os.path.getsize(NEW) / 2**30))


if __name__ == "__main__":
    main()
