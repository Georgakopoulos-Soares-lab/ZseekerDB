"""Exercise file formats and compressed archives without production-scale I/O."""
import csv
import hashlib
import json
import sys
import tarfile
from pathlib import Path
import duckdb

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from export_release import ParallelGzip, HUMAN, SUPERKINGDOMS
import export_release


def test_parallel_gzip_members_roundtrip(tmp_path):
    import gzip
    content=b'ACGT0123456789' * 900000
    path=tmp_path/'multi.gz'
    writer=ParallelGzip(path,workers=2)
    for i in range(0,len(content),17000):writer.write(content[i:i+17000])
    writer.close()
    assert gzip.decompress(path.read_bytes())==content
    assert hashlib.sha256(path.read_bytes()).hexdigest()==writer.sha256.hexdigest()


def test_all_formats_preserve_human_alias_scope_and_bed_end(tmp_path,monkeypatch):
    db=tmp_path/'data.duckdb';meta=tmp_path/'metadata.tsv'
    con=duckdb.connect(str(db))
    con.execute('CREATE TABLE data ("Chromosome" VARCHAR,"Start" BIGINT,"End" BIGINT,"Z-DNA Score" FLOAT,"Sequence" VARCHAR,assembly VARCHAR)')
    con.execute('CREATE TABLE metadata_all (assembly VARCHAR,superkingdom VARCHAR,obs_n_zdna BIGINT)')
    with meta.open('w') as f:
        writer=csv.writer(f,delimiter='\t');writer.writerow(['assembly','superkingdom'])
        for i,sk in enumerate(SUPERKINGDOMS):
            assembly=HUMAN if sk=='Eukaryota' else f'GCF_{i:09d}.1'
            con.execute("INSERT INTO data VALUES ('NC_060925.1',0,3,60,'ACGT',?)",[assembly])
            con.execute('INSERT INTO metadata_all VALUES (?,?,1)',[assembly,sk])
            writer.writerow([assembly,sk])
    con.close()
    out=tmp_path/'export'
    monkeypatch.setattr(sys,'argv',['export_release.py',str(db),str(meta),str(out)])
    export_release.main()
    manifest=json.loads((out/'release_manifest.json').read_text())
    assert len(manifest['files'])==23
    for entry in manifest['files']:
        path=out/entry['filename']
        assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
        with tarfile.open(path,'r:gz') as tar:assert 'README.txt' in tar.getnames()
    con=duckdb.connect()
    for sk,expected in [('Eukaryota','1'),('Archaea','NC_060925.1')]:
        path=next((out/f'csv/superkingdom={sk}').glob('*.csv'))
        row=list(csv.DictReader(path.open()))[0]
        assert row['Chromosome']==expected
        assert set(row)=={'Chromosome','Start','End','Z-DNA Score','Sequence','assembly'}
        path=next((out/f'json/superkingdom={sk}').glob('*.json'))
        assert json.loads(path.read_text())[0]['Chromosome']==expected
        path=next((out/f'bed/superkingdom={sk}').glob('*.bed'))
        row=next(csv.reader(path.open(),delimiter='\t'))
        assert row[:3]==[expected,'0','4']
        path=next((out/f'parquet/superkingdom={sk}').glob('*.parquet'))
        assert con.execute('SELECT "Chromosome","Start","End" FROM read_parquet(?)',[str(path)]).fetchone()==(expected,0,3)
    con.close()
