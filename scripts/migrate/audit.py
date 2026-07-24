"""Name-mismatch audit: CSV assemblies vs metadata-TSV assemblies, regex coverage.

Run AFTER extraction completes. Read-only; does not touch the DB.
"""
import os
import re
import glob
import duckdb
from common import CSV_DIR, META_TSV, ACCESSION_RE, LOG_DIR

rx = re.compile(ACCESSION_RE)


def csv_assemblies():
    acc = {}
    unmatched = []
    empties = []
    for p in glob.iglob(os.path.join(CSV_DIR, "*.zseeker.csv")):
        base = os.path.basename(p)
        m = rx.match(base)
        if not m:
            unmatched.append(base)
            continue
        a = m.group(1)
        acc.setdefault(a, base)  # keep first filename for is_t2t detection
        try:
            if os.path.getsize(p) == 0:
                empties.append(base)
        except OSError:
            pass
    return acc, unmatched, empties


def main():
    acc, unmatched, empties = csv_assemblies()
    print(f"CSV files parsed -> {len(acc)} distinct assemblies")
    print(f"filenames NOT matching accession regex: {len(unmatched)}")
    for u in unmatched[:20]:
        print("   UNMATCHED:", u)
    print(f"zero-byte CSV files: {len(empties)}")

    con = duckdb.connect()
    tsv_set = set(r[0] for r in con.execute(
        f"SELECT DISTINCT assembly FROM read_csv('{META_TSV}', delim='\t', header=true, all_varchar=true)"
    ).fetchall())
    csv_set = set(acc)
    inter = csv_set & tsv_set
    csv_only = csv_set - tsv_set
    tsv_only = tsv_set - csv_set
    print(f"\nassemblies in TSV: {len(tsv_set)}")
    print(f"intersection (CSV & TSV): {len(inter)}")
    print(f"CSV-only (data w/o metadata): {len(csv_only)}")
    print(f"TSV-only (metadata w/o data): {len(tsv_only)}")
    for a in list(csv_only)[:15]:
        print("   CSV-only:", a)
    for a in list(tsv_only)[:15]:
        print("   TSV-only:", a)

    os.makedirs(LOG_DIR, exist_ok=True)
    with open(os.path.join(LOG_DIR, "audit.txt"), "w") as f:
        f.write(f"csv_assemblies={len(acc)} unmatched={len(unmatched)} empties={len(empties)}\n")
        f.write(f"tsv_assemblies={len(tsv_set)} intersection={len(inter)} csv_only={len(csv_only)} tsv_only={len(tsv_only)}\n")
    print("\nwrote", os.path.join(LOG_DIR, "audit.txt"))


if __name__ == "__main__":
    main()
