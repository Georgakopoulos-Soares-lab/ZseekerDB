"""Build metadata, chromosomes, tax_names, stat tables, and views.

Run AFTER build_data.py has fully populated `data` (from-scratch path). The incremental
path from the July DB is rebuild_release.py; both use the same steps in release.py.

Assemblies that end up without a metadata row (absent from the TSV, or dropped for having
no predictions) are deleted from `data`, so every assembly in `data` has metadata.
"""
from common import META_TSV, connect, logger
import release

log = logger("build_meta_stats.log")


def main():
    con = connect()
    ndata = con.execute("SELECT COUNT(*) FROM data").fetchone()[0]
    assert ndata > 0, "data table empty - run build_data.py first"
    log(f"data rows present: {ndata:,}")

    release.build_t2t_table(con, log)
    release.build_metadata(con, META_TSV, log)
    n = con.execute("DELETE FROM data WHERE assembly NOT IN (SELECT assembly FROM metadata)").fetchone()[0]
    log(f"deleted {n:,} data rows of assemblies without metadata")

    release.build_derived(con, log)
    release.build_views(con, log)
    con.execute("DROP TABLE IF EXISTS _ingest_state")
    con.execute("CHECKPOINT")
    log("DONE build_meta_stats")
    con.close()


if __name__ == "__main__":
    main()
