"""Build the `data` table from extracted *.zseeker.csv files.

Robust + resumable:
  * Files are processed in a STABLE sorted order, in atomic transactions.
  * Batches are bounded by cumulative BYTES (not file count) so a mix of tiny
    viral genomes and multi-GB genomes never produces an oversized in-memory batch.
  * Resume is a sorted-file PREFIX: done = SUM(nfiles) already recorded in
    _ingest_state. Because every batch commits a contiguous prefix atomically, the
    completed set is always the first N sorted files -> safe across restarts AND
    across changes to the batching scheme.

Schema (matches old DB exactly):
  Chromosome VARCHAR, Start BIGINT, End BIGINT, "Z-DNA Score" DOUBLE,
  Sequence VARCHAR, assembly VARCHAR, Chromosome_alt VARCHAR
"""
import os
import glob
import time
from common import connect, CSV_DIR, ACCESSION_RE, LOG_DIR, DB_PATH

CAP_BYTES = int(os.environ.get("MIG_BATCH_BYTES", str(500 * 1024 * 1024)))  # ~500MB input/batch
CAP_FILES = int(os.environ.get("MIG_BATCH_MAXFILES", "4000"))               # also cap #files/batch
RETRY_THREADS = 1
COLS = "{'Chromosome':'VARCHAR','Start':'BIGINT','End':'BIGINT','Z-DNA Score':'DOUBLE','Sequence':'VARCHAR'}"
LOG = os.path.join(LOG_DIR, "build_data.log")


def log(msg):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def q(p):
    return "'" + p.replace("'", "''") + "'"


def select_from(files_sql):
    return f"""
        SELECT "Chromosome", "Start", "End", "Z-DNA Score", "Sequence",
               regexp_extract(parse_filename(filename), '{ACCESSION_RE}', 1) AS assembly,
               "Chromosome" AS Chromosome_alt
        FROM read_csv([{files_sql}], header=true, delim=',',
                      columns={COLS}, filename=true)
    """


def ensure_schema(con):
    con.execute("""
        CREATE TABLE IF NOT EXISTS data (
            "Chromosome" VARCHAR, "Start" BIGINT, "End" BIGINT, "Z-DNA Score" DOUBLE,
            "Sequence" VARCHAR, assembly VARCHAR, Chromosome_alt VARCHAR
        )""")
    con.execute("CREATE TABLE IF NOT EXISTS _ingest_state (batch_id INTEGER PRIMARY KEY, nfiles INTEGER, nrows BIGINT, ts TIMESTAMP)")


def safe_rollback(con):
    try:
        con.execute("ROLLBACK")
    except Exception:
        pass


def commit_batch(con, bid, chunk):
    """Insert a chunk atomically with its state row. Returns rows inserted."""
    files_sql = ",".join(q(p) for p in chunk)
    con.execute("BEGIN")
    n = con.execute(f"INSERT INTO data {select_from(files_sql)}").fetchone()[0]
    con.execute("INSERT INTO _ingest_state VALUES (?, ?, ?, now())", [bid, len(chunk), n])
    con.execute("COMMIT")
    return n


def make_batches(files, sizes, start):
    i = start
    n = len(files)
    while i < n:
        j = i
        cum = 0
        while j < n and (j - i) < CAP_FILES and (cum == 0 or cum + sizes[j] <= CAP_BYTES):
            cum += sizes[j]
            j += 1
        yield files[i:j], cum
        i = j


def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    con = connect()
    ensure_schema(con)

    files = sorted(p for p in glob.glob(os.path.join(CSV_DIR, "*.zseeker.csv")) if os.path.getsize(p) > 0)
    sizes = [os.path.getsize(p) for p in files]
    total = len(files)

    done_files = con.execute("SELECT COALESCE(SUM(nfiles),0) FROM _ingest_state").fetchone()[0]
    next_id = (con.execute("SELECT COALESCE(MAX(batch_id),-1) FROM _ingest_state").fetchone()[0]) + 1
    log(f"total non-empty files={total} cap_bytes={CAP_BYTES} resume_from_file={done_files} next_batch_id={next_id}")

    bid = next_id
    processed = done_files
    for chunk, cum in make_batches(files, sizes, done_files):
        try:
            n = commit_batch(con, bid, chunk)
            processed += len(chunk)
            log(f"batch {bid} ok (+{len(chunk)} files, {cum/1e6:.0f}MB, +{n} rows) files {processed}/{total}")
        except Exception as e:
            log(f"batch {bid} FAILED ({len(chunk)} files, {cum/1e6:.0f}MB): {e!r}")
            safe_rollback(con)
            con.close()
            con = connect()             # clear any poisoned transaction state
            con.execute(f"PRAGMA threads={RETRY_THREADS}")
            try:
                n = commit_batch(con, bid, chunk)
                processed += len(chunk)
                log(f"batch {bid} RECOVERED on retry (threads={RETRY_THREADS}, +{n} rows) files {processed}/{total}")
                con.close()
                con = connect()
            except Exception as e2:
                log(f"batch {bid} FATAL on retry: {e2!r} -- first offending files: "
                    + ", ".join(os.path.basename(p) for p in chunk[:5]))
                raise
        bid += 1

    final = con.execute("SELECT COUNT(*) FROM data").fetchone()[0]
    asm = con.execute("SELECT COUNT(DISTINCT assembly) FROM data").fetchone()[0]
    log(f"DONE build_data total_rows={final} distinct_assemblies={asm} db={DB_PATH}")
    con.close()


if __name__ == "__main__":
    main()
