"""Export final supplementary assembly metadata with recomputed observations.

Preserve all supplied assembly attributes, replace the three stale prediction
summary fields from metadata_all, and append the filename-derived T2T flag.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('database'); ap.add_argument('input_tsv'); ap.add_argument('output_tsv')
    args = ap.parse_args()
    out = Path(args.output_tsv)
    if out.resolve() == Path(args.input_tsv).resolve():
        raise ValueError('Preserve the original input TSV')
    con = duckdb.connect(args.database, read_only=True)
    path = str(Path(args.input_tsv).resolve()).replace("'", "''")
    destination = str(out.resolve()).replace("'", "''")
    n = con.execute('SELECT COUNT(*) FROM metadata_all').fetchone()[0]
    actual, reported = con.execute('SELECT (SELECT COUNT(*) FROM data), SUM(obs_n_zdna) FROM metadata_all').fetchone()
    if actual != reported:
        raise ValueError(f'Prediction summaries have not been reconciled: {actual} != {reported}')
    con.execute(f'''COPY (
      SELECT s.* EXCLUDE ("Z-DNA/-RNA predictions count", "Z-DNA/-RNA bases count", "Z-DNA/-RNA density per kb"),
             m.obs_n_zdna AS "Z-DNA/-RNA predictions count", m.obs_zbp AS "Z-DNA/-RNA bases count",
             m.obs_density_per_kb AS "Z-DNA/-RNA density per kb", m.is_t2t
      FROM read_csv('{path}', delim='\t', header=true, all_varchar=true) s
      JOIN metadata_all m ON m.assembly=s.assembly ORDER BY s.assembly
    ) TO '{destination}' (FORMAT CSV, DELIMITER '\t', HEADER TRUE)''')
    exported = con.execute('SELECT COUNT(*) FROM read_csv(?, delim=\'\t\',header=true,all_varchar=true)', [str(out)]).fetchone()[0]
    if exported != n:
        raise ValueError(f'Export row count differs from metadata_all: {exported} != {n}')
    manifest = dict(assemblies=n, predictions=actual, built_at=datetime.now(timezone.utc).isoformat(),
                    metadata_sha256=hashlib.sha256(out.read_bytes()).hexdigest(),
                    input_metadata_sha256=hashlib.sha256(Path(args.input_tsv).read_bytes()).hexdigest(),
                    density_definition='sum of actual locus sequence lengths * 1000 / genome_size',
                    native_coordinates='0-based, inclusive end', bed_coordinates='0-based, half-open end')
    out.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))


if __name__ == '__main__':
    main()
