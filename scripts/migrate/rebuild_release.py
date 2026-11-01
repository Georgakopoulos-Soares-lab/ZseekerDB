"""Reuse native prediction records from an existing DuckDB without re-reading CSVs.

Set MIG_SOURCE_DB, MIG_DB_PATH, MIG_META_TSV and MIG_CSV_DIR explicitly.
Stages run in order: data, metadata, derived (all by default). The target must be
separate from the source. Placeholder-only rows are removed; malformed loci fail
validation. All assemblies remain eligible, and prediction summaries are always
recomputed before derived objects are built. Original CSV filenames, or final
metadata with is_t2t, are needed to preserve filename-derived T2T status.
"""
import os
from pathlib import Path
import sys

from common import DB_PATH, LOG_DIR, connect
import build_meta_stats as build
from release import recompute_observed

STAGES = ("data", "metadata", "derived")


def stage_data(con, source_path):
    if con.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_catalog=current_database() AND table_name='data'").fetchone()[0]:
        print("data exists; keeping its validated records", flush=True)
        return
    source = Path(source_path).resolve()
    if not source.is_file():
        raise ValueError(f"Source database does not exist: {source}")
    con.execute("ATTACH '" + str(source).replace("'", "''") + "' AS src (READ_ONLY)")
    try:
        placeholder = '''"Start" IS NULL AND "End" IS NULL
          AND "Z-DNA Score" IS NULL AND "Sequence" IS NULL'''
        valid = '''"Chromosome" IS NOT NULL AND "Start" IS NOT NULL AND "Start" >= 0
          AND "End" IS NOT NULL AND "End" >= "Start"
          AND "Z-DNA Score" IS NOT NULL AND "Sequence" IS NOT NULL
          AND assembly IS NOT NULL AND assembly <> ''
          AND length("Sequence") = "End" - "Start" + 1'''
        bad = con.execute(f"SELECT COUNT(*) FROM src.data WHERE NOT ({placeholder}) AND NOT ({valid})").fetchone()[0]
        if bad:
            raise ValueError(f"Source has {bad:,} malformed prediction records")
        con.execute(f'''CREATE TABLE data AS SELECT
          "Chromosome"::VARCHAR AS "Chromosome", "Start"::BIGINT AS "Start",
          "End"::BIGINT AS "End", "Z-DNA Score"::FLOAT AS "Z-DNA Score",
          "Sequence"::VARCHAR AS "Sequence", assembly::VARCHAR AS assembly
          FROM src.data WHERE {valid}''')
    finally:
        con.execute("DETACH src")


def main():
    stages = sys.argv[1:] or STAGES
    if any(stage not in STAGES for stage in stages):
        raise ValueError(f"Choose stages from {STAGES}")
    source = os.environ.get("MIG_SOURCE_DB", "")
    if "data" in stages and (not source or Path(source).resolve() == Path(DB_PATH).resolve()):
        raise ValueError("MIG_SOURCE_DB must name an existing database separate from MIG_DB_PATH")
    os.makedirs(LOG_DIR, exist_ok=True)
    con = connect()
    try:
        if "data" in stages:
            stage_data(con, source)
        if "metadata" in stages:
            build.build_t2t_map(con)
            build.build_metadata(con)
        if "derived" in stages:
            recompute_observed(con, os.environ.get("MIG_DROP_EMPTY_ASSEMBLIES", "1") == "1")
            build.build_aux(con)
            build.build_stats(con)
            build.build_views(con)
            con.execute("DROP TABLE IF EXISTS _asm_t2t")
        con.execute("CHECKPOINT")
    finally:
        con.close()


if __name__ == "__main__":
    main()
