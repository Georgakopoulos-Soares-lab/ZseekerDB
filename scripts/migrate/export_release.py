"""Export the verified dataset and build checksummed archive bundles.

Exports produce superkingdom-partitioned CSV, JSON arrays, Parquet and BED4.
DuckDB 1.1 JSON output requires a separate scan per superkingdom. Full CSV/JSON/Parquet downloads are split by superkingdom membership,
not by cutting compressed byte streams. Source files and existing bundles are
never overwritten. Completed export phases and bundles can be resumed.
"""
import argparse
import gzip
import hashlib
import json
import shutil
import tarfile
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb

SUPERKINGDOMS = ['Archaea', 'Bacteria', 'Eukaryota', 'Viruses']
HUMAN = 'GCF_009914755.1'


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def chromosome_expression():
    cases = []
    for i in range(24):
        label = str(i+1) if i < 22 else ['X','Y'][i-22]
        cases.append(f"WHEN 'NC_{60925+i:06d}.1' THEN '{label}'")
    return f"CASE WHEN d.assembly='{HUMAN}' THEN CASE d.\"Chromosome\" {' '.join(cases)} ELSE d.\"Chromosome\" END ELSE d.\"Chromosome\" END"


class ParallelGzip:
    """Bounded, ordered gzip members; readable by ordinary gzip/tar clients."""
    def __init__(self, path, workers=8, compression_level=3):
        self.file = Path(path).open('xb')
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.pending = deque()
        self.buffer = bytearray()
        self.limit = workers * 2
        self.compression_level = compression_level
        self.sha256 = hashlib.sha256()
        self.md5 = hashlib.md5()

    def _drain(self):
        data = self.pending.popleft().result()
        self.file.write(data)
        self.sha256.update(data); self.md5.update(data)

    def write(self, data):
        n = len(data); self.buffer.extend(data)
        while len(self.buffer) >= 4 * 1024 * 1024:
            block = bytes(self.buffer[:4 * 1024 * 1024]); del self.buffer[:4 * 1024 * 1024]
            self.pending.append(self.pool.submit(gzip.compress, block, compresslevel=self.compression_level, mtime=0))
            if len(self.pending) >= self.limit:
                self._drain()
        return n

    def close(self):
        try:
            if self.buffer:
                self.pending.append(self.pool.submit(gzip.compress, bytes(self.buffer), compresslevel=self.compression_level, mtime=0))
            while self.pending:
                self._drain()
        finally:
            self.pool.shutdown(wait=True); self.file.close()


def pack(path, entries, compression_level=3):
    partial = path.with_name(path.name+'.partial')
    writer = ParallelGzip(partial, compression_level=compression_level)
    try:
        with tarfile.open(fileobj=writer, mode='w|', format=tarfile.PAX_FORMAT) as tar:
            for source, name in entries:
                info = tar.gettarinfo(str(source), arcname=name)
                info.uid=info.gid=0; info.uname=info.gname=''; info.mtime=0
                with source.open('rb') as inp:
                    tar.addfile(info, inp)
    finally:
        writer.close()
    partial.rename(path)
    return dict(filename=path.name, bytes=path.stat().st_size,
                sha256=writer.sha256.hexdigest(), md5=writer.md5.hexdigest())


def save_manifest(path, manifest):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(manifest,indent=2)+'\n'); temporary.replace(path)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('database'); ap.add_argument('metadata_tsv'); ap.add_argument('output')
    ap.add_argument('--threads',type=int,default=4)
    args=ap.parse_args()
    database=Path(args.database).resolve(); metadata=Path(args.metadata_tsv).resolve()
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    fingerprint=dict(database=str(database),bytes=database.stat().st_size,
        mtime_ns=database.stat().st_mtime_ns,metadata_sha256=hashlib.sha256(metadata.read_bytes()).hexdigest(),
        exporter_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    manifest_path=out/'release_manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else dict(source=fingerprint,phases=[],files=[])
    if manifest['source'] != fingerprint:
        raise ValueError('Existing export belongs to a different database or metadata file; use a new output directory')
    con=duckdb.connect(str(database),read_only=True)
    con.execute(f'SET threads={args.threads}');con.execute("SET memory_limit='20GB'")
    n=con.execute('SELECT COUNT(*) FROM data').fetchone()[0]
    reported,assemblies=con.execute('SELECT SUM(obs_n_zdna),COUNT(*) FROM metadata_all').fetchone()
    if n != reported:
        raise ValueError('Metadata observations have not been reconciled with data')
    manifest.update(assemblies=assemblies,predictions=n)
    readme=out/'README.txt'
    readme.write_text('ZSeekerDB final dataset\n\nCSV, JSON and Parquet use zero-based starts and inclusive ends.\nBED4 uses zero-based, half-open ends; its name field contains the assembly accession and unscaled ZSeeker score.\nOnly GCF_009914755.1 uses chromosome labels 1 through 22, X, Y for NC_060925.1 through NC_060948.1. Other accessions are unchanged.\nMetadata includes assemblies with no predictions. Observed counts, predicted bases and density were recomputed from actual loci; density is predicted bases * 1000 / genome_size.\nRNA-virus sequences are cDNA-scored sequence predictions, not experimentally validated Z-RNA structures.\nFull CSV/JSON/Parquet part 1 contains Archaea, Bacteria and Viruses; part 2 contains Eukaryota. Both parts are required for the complete dataset. Full downloads contain the compressed per-superkingdom archives: unpack the outer container, then unpack the required inner archives.\n')
    metadata_paths={}
    for sk in SUPERKINGDOMS:
        target=out/f'{sk.lower()}_metadata.tsv';metadata_paths[sk]=target
        if not target.exists():
            con.execute(f"COPY (SELECT * FROM read_csv({quote(metadata)},delim='\t',header=true,all_varchar=true) WHERE superkingdom={quote(sk)}) TO {quote(target)} (FORMAT CSV,DELIMITER '\t',HEADER TRUE)")
    chrom=chromosome_expression()
    common=f'FROM data d JOIN metadata_all m ON m.assembly=d.assembly'
    native=f'{chrom} AS "Chromosome",d."Start",d."End",d."Z-DNA Score",d."Sequence",d.assembly'
    bed=f'{chrom} AS chrom,d."Start" AS chromStart,d."End"+1 AS chromEnd,concat(d.assembly,\'|ZSeeker_score=\',d."Z-DNA Score"::VARCHAR) AS name'
    options={'csv':"FORMAT CSV,HEADER TRUE",'json':"FORMAT JSON,ARRAY TRUE",'parquet':"FORMAT PARQUET,COMPRESSION ZSTD",'bed':"FORMAT CSV,DELIMITER '\t',HEADER FALSE"}
    for fmt,opts in options.items():
        directory=out/fmt
        if fmt not in manifest['phases']:
            if directory.exists():
                raise ValueError(f'Incomplete export directory {directory}; inspect and remove it before retrying this phase')
            print(f'Exporting {fmt}: {n:,} predictions',flush=True)
            projection=bed if fmt=='bed' else native
            if fmt=='json':
                written=0
                for sk in SUPERKINGDOMS:
                    partition=directory/f'superkingdom={sk}';partition.mkdir(parents=True)
                    written+=con.execute(f'COPY (SELECT {projection} {common} WHERE m.superkingdom={quote(sk)}) TO {quote(partition/"data_0.json")} ({opts})').fetchone()[0]
            else:
                written=con.execute(f'COPY (SELECT {projection},m.superkingdom {common}) TO {quote(directory)} ({opts},PARTITION_BY(superkingdom))').fetchone()[0]
            if written != n:
                raise ValueError(f'COPY row count mismatch for {fmt}: {written} != {n}')
            if fmt=='bed':
                for path in directory.rglob('*.csv'):path.rename(path.with_suffix('.bed'))
            manifest['phases'].append(fmt);save_manifest(manifest_path,manifest)
        groups=[(sk.lower()+'_'+fmt.upper()+'.tar.gz',[sk]) for sk in SUPERKINGDOMS]
        if fmt=='bed':
            groups.append(('zseekerdb_bed.tar.gz',SUPERKINGDOMS))
        else:
            groups.extend([(f'zseeker_{fmt}_part1.tar.gz',['Archaea','Bacteria','Viruses']),
                           (f'zseeker_{fmt}_part2.tar.gz',['Eukaryota'])])
        completed={entry['filename'] for entry in manifest['files']}
        for filename,superkingdoms in groups:
            if filename in completed:
                record=next(r for r in manifest['files'] if r['filename']==filename)
                if not (out/filename).is_file() or (out/filename).stat().st_size!=record['bytes']:
                    raise ValueError(f'Completed archive is missing or has changed: {filename}')
                continue
            entries=[(readme,'README.txt')]
            full=filename.startswith('zseeker')
            for sk in superkingdoms:
                if full:
                    source=out/(sk.lower()+'_'+fmt.upper()+'.tar.gz')
                    entries.append((source,source.name))
                else:
                    entries.append((metadata_paths[sk],metadata_paths[sk].name))
                    for source in sorted((directory/f'superkingdom={sk}').rglob('*')):
                        if source.is_file():entries.append((source,f'{sk.lower()}_data/{source.name}'))
            print(f'Packaging {filename}',flush=True)
            # Store the already-compressed subgroup archives without recompressing
            # their payloads. These remain standard gzip/tar containers.
            result=pack(out/filename,entries,compression_level=0 if full else 3)
            result.update(format=fmt.upper(),superkingdoms=superkingdoms,layout='nested superkingdom archives' if full else 'prediction shards and metadata')
            (out/(filename+'.md5')).write_text(result['md5']+'\n')
            manifest['files'].append(result);save_manifest(manifest_path,manifest)
    if metadata != (out/'assembly_metadata.tsv').resolve():
        shutil.copy2(metadata,out/'assembly_metadata.tsv')
    print('All export phases and archive checksums complete',flush=True)


if __name__=='__main__':
    main()
