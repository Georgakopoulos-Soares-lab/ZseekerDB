"""Benchmark the 2-bit BLOB Sequence encoding vs VARCHAR on a real-data subset:
space, encode/decode throughput, peak memory, and query runtime (scan + LIKE).

Builds a representative subset table from real CSVs both ways in a scratch DuckDB,
then measures. Correctness is covered by tests/; this is purely space/speed.
"""
import glob
import os
import resource
import time

import duckdb
import seqcodec as sc
from common import CSV_DIR, TMP_DIR

BENCH_DB = "/scratch/10899/kimopro/ZSeekerDB_migration/build/bench_blob.duckdb"
TARGET_BYTES = int(os.environ.get("BENCH_TARGET_BYTES", str(3 * 1024**3)))  # ~3GB of CSVs
BS = 262144


def pick_files():
    files = sorted(glob.glob(os.path.join(CSV_DIR, "*.zseeker.csv")))
    # spread across the sorted range (small viral -> large eukaryote) for representativeness
    stride = max(1, len(files) // 4000)
    chosen, total = [], 0
    for p in files[::stride]:
        sz = os.path.getsize(p)
        if sz == 0:
            continue
        chosen.append(p)
        total += sz
        if total >= TARGET_BYTES:
            break
    return chosen, total


def col_bytes(con, table):
    rows = con.execute(f"""SELECT column_name, COUNT(DISTINCT block_id)*{BS} AS b
        FROM pragma_storage_info('{table}') WHERE block_id>=0 GROUP BY 1""").fetchall()
    return {c: b for c, b in rows}


def main():
    if os.path.exists(BENCH_DB):
        os.remove(BENCH_DB)
    files, total = pick_files()
    fs = ",".join("'" + p + "'" for p in files)
    con = duckdb.connect(BENCH_DB)
    con.execute("PRAGMA threads=4"); con.execute(f"PRAGMA temp_directory='{TMP_DIR}'")
    con.execute("PRAGMA memory_limit='8GB'")
    sc.register_duckdb_udfs(con)
    COLS = "{'Chromosome':'VARCHAR','Start':'BIGINT','End':'BIGINT','Z-DNA Score':'DOUBLE','Sequence':'VARCHAR'}"

    print(f"subset: {len(files)} files, {total/1e9:.2f} GB CSV")
    t = time.time()
    con.execute(f"""CREATE TABLE data_v AS
       SELECT "Chromosome","Start","End","Z-DNA Score","Sequence"
       FROM read_csv([{fs}], header=true, delim=',', columns={COLS})""")
    n = con.execute("SELECT COUNT(*) FROM data_v").fetchone()[0]
    print(f"loaded data_v: {n:,} rows in {time.time()-t:.1f}s")

    # BLOB table via seq_encode UDF (Python) — also times an encode pass
    t = time.time()
    con.execute("""CREATE TABLE data_b AS
       SELECT "Chromosome","Start","End","Z-DNA Score", seq_encode("Sequence") AS seq_packed
       FROM data_v""")
    enc_dt = time.time() - t
    con.execute("CHECKPOINT")
    print(f"built data_b (encode pass): {enc_dt:.1f}s  -> {n/enc_dt/1e6:.2f} M rows/s")

    vb = col_bytes(con, "data_v")
    bb = col_bytes(con, "data_b")
    seq_v = vb.get("Sequence", 0)
    seq_b = bb.get("seq_packed", 0)
    print("\n=== SPACE (subset) ===")
    print(f"  Sequence VARCHAR : {seq_v/2**30:.3f} GiB")
    print(f"  seq_packed BLOB  : {seq_b/2**30:.3f} GiB")
    if seq_b:
        print(f"  ratio VARCHAR/BLOB: {seq_v/seq_b:.2f}x   (BLOB is {100*seq_b/seq_v:.1f}% of VARCHAR)")
    # extrapolate to full DB (measured Sequence = 102.6 GiB)
    if seq_v:
        proj = 102.6 * seq_b / seq_v
        print(f"  => projected full Sequence: 102.6 GiB -> {proj:.1f} GiB  (save ~{102.6-proj:.0f} GiB)")
        print(f"  => projected full DB: ~140 GiB -> ~{140-(102.6-proj):.0f} GiB")

    print("\n=== RUNTIME ===")
    def timeit(label, sql, reps=1):
        best = 1e9
        for _ in range(reps):
            t = time.time(); con.execute(sql).fetchall(); best = min(best, time.time()-t)
        print(f"  {label:42s} {best*1000:8.1f} ms")
        return best
    # pure scan (I/O): reading the column
    timeit("scan sum(len) VARCHAR", 'SELECT SUM(LENGTH("Sequence")) FROM data_v')
    timeit("scan count BLOB (no decode)", 'SELECT COUNT(*) FROM data_b WHERE seq_packed IS NOT NULL')
    timeit("scan sum(len) via decode UDF", 'SELECT SUM(LENGTH(seq_decode(seq_packed))) FROM data_b')
    # substring search (the feature that needs decode)
    for needle in ("ACGTACGT", "GCGCGCGC"):
        timeit(f"LIKE '%{needle}%' VARCHAR",
               f"SELECT COUNT(*) FROM data_v WHERE \"Sequence\" LIKE '%{needle}%'")
        timeit(f"LIKE '%{needle}%' decode UDF",
               f"SELECT COUNT(*) FROM data_b WHERE seq_decode(seq_packed) LIKE '%{needle}%'")

    # decode throughput (pure python, representative of a compiled decoder's *work*, not speed)
    sample = [r[0] for r in con.execute('SELECT "Sequence" FROM data_v USING SAMPLE 200000 ROWS').fetchall()]
    blobs = [sc.encode(s) for s in sample]
    t = time.time()
    for b in blobs:
        sc.decode(b)
    ddt = time.time() - t
    print(f"\n  python decode throughput: {len(blobs)/ddt/1e6:.2f} M rows/s")

    print(f"\n=== MEMORY ===")
    print(f"  peak RSS this process: {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1e6:.2f} GB")
    con.close()
    os.remove(BENCH_DB)


if __name__ == "__main__":
    main()
