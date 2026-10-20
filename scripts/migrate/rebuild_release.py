"""Build the Oct-2026 release DB from the July build + the Oct-2026 metadata TSV.

The prediction tarball is byte-identical to the one the July build loaded, so instead of
re-extracting and re-ingesting 2.59B rows this copies `data` out of the July DB
(SOURCE_DB, attached read-only) into a fresh file, dropping:
  * placeholder rows: ZSeeker writes `Chromosome,,,,` for every sequence with no
    predictions (24,116,216 all-NULL rows in the July build)
  * assemblies absent from the new TSV (GCA_947361175.1, GCA_963931935.1)
Row order (= sorted source-file order, i.e. clustered by assembly) is preserved.

Stages (default: all, in order):
  data      copy filtered `data`                                  (~1h)
  metadata  metadata from TSV (+ is_t2t from CSV filenames)       (~1 min)
  derived   chromosomes, tax_names, data_kpis, data_top_*, views  (~10 min)

    python3 rebuild_release.py [data|metadata|derived ...]
"""
import os
import sys
import time

from common import DB_PATH, META_TSV, SOURCE_DB, connect, logger
import release

log = logger("rebuild_release.log")
STAGES = ["data", "metadata", "derived"]


def _q(s):
    return "'" + s.replace("'", "''") + "'"


def table_exists(con, name):
    return con.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='main' AND table_name=?",
        [name]).fetchone()[0] > 0


def stage_data(con):
    if table_exists(con, "data"):
        log("data exists -> skip (drop it to rebuild)")
        return
    con.execute(f"ATTACH {_q(SOURCE_DB)} AS src (READ_ONLY)")
    excluded = [r[0] for r in con.execute(f"""
        SELECT k FROM src.data_top_asm
        WHERE k NOT IN (SELECT assembly_accession
                        FROM read_csv({_q(META_TSV)}, delim='\t', header=true, all_varchar=true))
        ORDER BY 1""").fetchall()]
    log(f"assemblies in July data but not in TSV (excluded): {excluded}")
    # Plain filter (no join) so DuckDB keeps insertion order.
    not_in = f"AND assembly NOT IN ({', '.join(_q(a) for a in excluded)})" if excluded else ""
    t = time.time()
    con.execute(f"""
        CREATE TABLE data AS
        SELECT "Chromosome", "Start", "End", "Z-DNA Score", "Sequence", assembly
        FROM src.data
        WHERE "Start" IS NOT NULL {not_in}""")
    con.execute("CHECKPOINT")
    n = con.execute("SELECT COUNT(*) FROM data").fetchone()[0]
    log(f"data copied in {time.time() - t:.0f}s: {n:,} rows")
    con.execute("DETACH src")


def stage_metadata(con):
    release.build_t2t_table(con, log)
    release.build_metadata(con, META_TSV, log)


def stage_derived(con):
    release.build_derived(con, log)
    release.build_views(con, log)


def main():
    stages = sys.argv[1:] or STAGES
    bad = [s for s in stages if s not in STAGES]
    assert not bad, f"unknown stage(s) {bad}; choose from {STAGES}"
    log(f"START stages={stages} db={DB_PATH} source={SOURCE_DB} tsv={META_TSV}")
    con = connect(DB_PATH)
    for s in STAGES:
        if s in stages:
            log(f"stage {s} ...")
            globals()[f"stage_{s}"](con)
    con.execute("CHECKPOINT")
    con.close()
    log(f"DONE stages={stages} size={os.path.getsize(DB_PATH) / 2**30:.1f} GiB")


if __name__ == "__main__":
    main()
