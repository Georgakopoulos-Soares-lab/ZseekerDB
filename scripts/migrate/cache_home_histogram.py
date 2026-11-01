"""Cache the exact species-balanced homepage sample before deploying a database.

The cache is embedded in the Go binary. Its fingerprint covers every observed
assembly, species grouping and prediction count; stored database score/length
statistics are checked too. No prediction rows are scanned on matching startups.
"""
import argparse
import hashlib
import json
from pathlib import Path

import duckdb


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('database')
    ap.add_argument('--metadata-json', help='Observed assembly/species/count rows exported from the target metadata_all')
    ap.add_argument('--insights-json', help='Reuse an exact completed target /api/home/insights response')
    ap.add_argument('--stats-json', help='Target data_kpis statistics, required with --insights-json')
    ap.add_argument('--output', default=str(Path(__file__).resolve().parents[2] / 'backend/assets/home_histograms.json'))
    args = ap.parse_args()
    con = duckdb.connect(args.database, read_only=True)
    con.execute('SET threads=4')
    con.execute("SET memory_limit='4GB'")
    if args.metadata_json:
        path = str(Path(args.metadata_json).resolve()).replace("'", "''")
        con.execute(f"CREATE TEMP TABLE _sample_metadata AS SELECT assembly,species_taxid,obs_n_zdna FROM read_json_auto('{path}')")
        mismatches = con.execute('''SELECT COUNT(*) FROM _sample_metadata m LEFT JOIN metadata_all s USING (assembly)
          WHERE s.assembly IS NULL OR m.obs_n_zdna IS DISTINCT FROM s.obs_n_zdna
             OR m.species_taxid IS DISTINCT FROM s.species_taxid''').fetchone()[0]
        if mismatches:
            raise ValueError(f'{mismatches} target assembly summaries differ from the source database')
    else:
        con.execute('CREATE TEMP VIEW _sample_metadata AS SELECT assembly,species_taxid,obs_n_zdna FROM metadata_all')
    rows = con.execute('SELECT assembly,species_taxid,obs_n_zdna FROM _sample_metadata WHERE obs_n_zdna>0 ORDER BY assembly').fetchall()
    digest = hashlib.sha256()
    for assembly, species, count in rows:
        digest.update(f"{assembly}\t{species if species is not None else '-'}\t{count}\n".encode())
    total = sum(row[2] for row in rows)
    if args.insights_json:
        if not args.stats_json:
            raise ValueError('--stats-json is required to reuse a target response')
        insights = json.loads(Path(args.insights_json).read_text())
        stats = json.loads(Path(args.stats_json).read_text())
        assert insights['kpis']['total_predictions'] == stats['total_sites'] == total
        bins = insights['histogram']
    else:
        if args.metadata_json:
            raise ValueError('A target response and statistics are required for a subset cache')
        columns = ['total_sites', 'avg_score', 'min_score', 'max_score', 'avg_seq_len']
        stats = dict(zip(columns, con.execute('SELECT '+','.join(columns)+' FROM data_kpis').fetchone()))
        assert stats['total_sites'] == total
        print(f'Computing exact balanced sample for {total:,} predictions', flush=True)
        values = con.execute('''SELECT FLOOR(d."Z-DNA Score"/10)*10 AS bin,COUNT(*) AS n FROM data d
          JOIN (SELECT assembly,4.0/SUM(obs_n_zdna) OVER (PARTITION BY species_taxid) AS rate
                FROM _sample_metadata WHERE obs_n_zdna>0) m USING (assembly)
          WHERE (hash(d.assembly,d."Start") % 1000000) < m.rate * 1000000
          GROUP BY 1 ORDER BY 1''').fetchall()
        bins = [dict(bin=b, n=n) for b, n in values]
    con.close()
    entry = dict(fingerprint=digest.hexdigest(), sample_per_taxid=4, stats=stats, bins=bins)
    output = Path(args.output)
    previous = json.loads(output.read_text()) if output.exists() else []
    previous = [item for item in previous if item['fingerprint'] != entry['fingerprint']]
    previous.append(entry)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(previous, indent=2)+'\n')
    print(json.dumps({'fingerprint':entry['fingerprint'],'bins':len(bins),'predictions':total}), flush=True)


if __name__ == '__main__':
    main()
