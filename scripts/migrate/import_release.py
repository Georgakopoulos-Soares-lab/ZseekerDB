"""Reconstruct the native database from one copy of each published Parquet shard.

Unpack the full-download containers and their inner superkingdom archives first.
The metadata TSV must be the final metadata supplied with those downloads.
"""
import argparse
import os
from pathlib import Path

import duckdb


def native_chromosome_expression():
    cases=[]
    for i in range(24):
        label=str(i+1) if i<22 else ['X','Y'][i-22]
        cases.append(f"WHEN '{label}' THEN 'NC_{60925+i:06d}.1'")
    return 'CASE WHEN assembly=\'GCF_009914755.1\' THEN CASE "Chromosome" '+ ' '.join(cases)+' ELSE "Chromosome" END ELSE "Chromosome" END'


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('parquet_glob');ap.add_argument('metadata_tsv');ap.add_argument('database')
    ap.add_argument('--threads',type=int,default=4)
    args=ap.parse_args()
    target=Path(args.database).resolve();metadata=Path(args.metadata_tsv).resolve()
    if target.exists():raise ValueError('Choose a new database path; existing databases are not overwritten')
    target.parent.mkdir(parents=True,exist_ok=True)
    con=duckdb.connect(str(target))
    try:
        con.execute(f'SET threads={args.threads}');con.execute("SET memory_limit='20GB'")
        source=args.parquet_glob.replace("'","''")
        meta=str(metadata).replace("'","''")
        expected=con.execute(f'SELECT SUM(TRY_CAST("Z-DNA/-RNA predictions count" AS BIGINT)) FROM read_csv(\'{meta}\',delim=\'\t\',header=true,all_varchar=true)').fetchone()[0]
        rows=con.execute(f"SELECT COUNT(*) FROM read_parquet('{source}')").fetchone()[0]
        if rows!=expected:raise ValueError(f'Shard count {rows} differs from metadata {expected}; check for missing or duplicate shard copies')
        print(f'Importing {rows:,} native prediction records',flush=True)
        con.execute(f'''CREATE TABLE data AS SELECT
          {native_chromosome_expression()}::VARCHAR AS "Chromosome",
          "Start"::BIGINT AS "Start", "End"::BIGINT AS "End",
          "Z-DNA Score"::FLOAT AS "Z-DNA Score", "Sequence"::VARCHAR AS "Sequence",
          assembly::VARCHAR AS assembly FROM read_parquet('{source}')''')
    finally:con.close()
    os.environ.update(MIG_ROOT=str(target.parent),MIG_DB_PATH=str(target),MIG_META_TSV=str(metadata),
                      MIG_CSV_DIR=str(target.parent/'_no_raw_csv_inputs'),MIG_THREADS=str(args.threads),MIG_FORCE='1')
    from build_meta_stats import main as build_derived
    build_derived()
    from verify import main as verify
    verify()


if __name__=='__main__':
    main()
