"""Shared config for the ZSeekerDB data migration.

The rebuilt DuckDB must be written with DuckDB 1.1.x (go-duckdb v1.8.5 -> engine 1.1.3),
otherwise the deployed Go server cannot open the file.
"""
import os
import time
import duckdb

ROOT = "/scratch/10899/kimopro/ZSeekerDB_migration"
BUILD = os.path.join(ROOT, "build")
CSV_DIR = os.path.join(BUILD, "csv")            # extracted *.zseeker.csv (flat)
TMP_DIR = os.path.join(BUILD, "tmp")            # duckdb spill dir
LOG_DIR = os.path.join(BUILD, "logs")
# Oct-2026 metadata release (31 cols). Supersedes the July TSV, whose Z-DNA stats were
# wrong for 17,999 assemblies.
META_TSV = os.environ.get(
    "MIG_META_TSV",
    "/corral/utexas/BCS25073/igs_group/geomeg/zseeker_db/zseeker_db_assembly_all_metadata.tsv")
DB_PATH = os.environ.get("MIG_DB_PATH", os.path.join(ROOT, "zdnadatabase_2026-10.duckdb"))  # final artifact
# July build (2.59B rows incl. placeholder rows); source for rebuild_release.py
SOURCE_DB = os.environ.get("MIG_SOURCE_DB", os.path.join(ROOT, "zdnadatabase_shrunk.duckdb"))

# Accession parsed from CSV filename, e.g. GCA_000003025.7_T2T-Sscrofa_genomic.zseeker.csv
ACCESSION_RE = r'^(GC[AF]_[0-9]+\.[0-9]+)'

THREADS = int(os.environ.get("MIG_THREADS", "4"))
MEM_GB = int(os.environ.get("MIG_MEM_GB", "20"))

assert duckdb.__version__.startswith("1.1."), f"need duckdb 1.1.x, got {duckdb.__version__}"


def logger(filename):
    """Return a log(msg) that prints and appends to LOG_DIR/filename."""
    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, filename)

    def log(msg):
        line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
        print(line, flush=True)
        with open(path, "a") as f:
            f.write(line + "\n")
    return log


def connect(db_path=DB_PATH, read_only=False):
    os.makedirs(TMP_DIR, exist_ok=True)
    con = duckdb.connect(db_path, read_only=read_only)
    con.execute(f"PRAGMA threads={THREADS}")
    con.execute(f"PRAGMA temp_directory='{TMP_DIR}'")
    con.execute(f"PRAGMA max_temp_directory_size='500GB'")
    con.execute(f"PRAGMA memory_limit='{MEM_GB}GB'")
    return con
