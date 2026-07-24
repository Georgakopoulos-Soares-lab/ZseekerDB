"""Shared config for the ZSeekerDB data migration.

The rebuilt DuckDB must be written with DuckDB 1.1.x (go-duckdb v1.8.5 -> engine 1.1.3),
otherwise the deployed Go server cannot open the file.
"""
import os
import duckdb

ROOT = "/scratch/10899/kimopro/ZSeekerDB_migration"
BUILD = os.path.join(ROOT, "build")
CSV_DIR = os.path.join(BUILD, "csv")            # extracted *.zseeker.csv (flat)
TMP_DIR = os.path.join(BUILD, "tmp")            # duckdb spill dir
LOG_DIR = os.path.join(BUILD, "logs")
META_TSV = os.path.join(ROOT, "zseeker_db_assembly_all_metadata.tsv")
DB_PATH = os.path.join(ROOT, "zdnadatabase.duckdb")   # final artifact

# Accession parsed from CSV filename, e.g. GCA_000003025.7_T2T-Sscrofa_genomic.zseeker.csv
ACCESSION_RE = r'^(GC[AF]_[0-9]+\.[0-9]+)'

THREADS = int(os.environ.get("MIG_THREADS", "4"))
MEM_GB = int(os.environ.get("MIG_MEM_GB", "20"))

assert duckdb.__version__.startswith("1.1."), f"need duckdb 1.1.x, got {duckdb.__version__}"


def connect(db_path=DB_PATH, read_only=False):
    os.makedirs(TMP_DIR, exist_ok=True)
    con = duckdb.connect(db_path, read_only=read_only)
    con.execute(f"PRAGMA threads={THREADS}")
    con.execute(f"PRAGMA temp_directory='{TMP_DIR}'")
    con.execute(f"PRAGMA max_temp_directory_size='500GB'")
    con.execute(f"PRAGMA memory_limit='{MEM_GB}GB'")
    return con
