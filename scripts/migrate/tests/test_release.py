"""Exercise metadata coverage, schema compatibility and placeholder removal."""
import csv
import sys
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from release import build_metadata
from build_data import select_from, q


def metadata_tsv(tmp_path, species_column='ncbi_species_taxid'):
    path = tmp_path / 'metadata.tsv'
    fields = ['assembly','ncbi_taxid',species_column,'resolve_level','genome_size','gc_percent',
              'superkingdom','kingdom','phylum','class','order','family','genus','tax_name',
              'viral_realm','updated_tax_name','Z-DNA/-RNA bases count','Z-DNA/-RNA density per kb','Z-DNA/-RNA predictions count']
    with path.open('w') as out:
        writer = csv.DictWriter(out, fields, delimiter='\t'); writer.writeheader()
        for i, count in enumerate([4, 0, 2]):
            row = dict.fromkeys(fields, '')
            row.update(assembly=f'GCF_{i:09d}.1', ncbi_taxid=str(i+1),resolve_level='complete',genome_size='100',gc_percent='40',superkingdom='Bacteria',kingdom='Test',tax_name='Test species')
            row[species_column] = '10' if i < 2 else '20'
            row['Z-DNA/-RNA predictions count'] = str(count)
            row['Z-DNA/-RNA density per kb'] = str(count*10)
            row['Z-DNA/-RNA bases count'] = str(count)
            writer.writerow(row)
    return path


@pytest.mark.parametrize('key',['ncbi_species_taxid','ncbi_summary_species_taxid'])
def test_all_assemblies_survive_while_browser_keeps_subset(tmp_path, key):
    con = duckdb.connect()
    path = metadata_tsv(tmp_path,key)
    assert build_metadata(con,path) == 3
    assert con.sql('SELECT COUNT(*) FROM metadata_all').fetchone()[0] == 3
    assert con.sql('SELECT COUNT(*) FROM metadata').fetchone()[0] == 2
    assert con.sql('SELECT COUNT(DISTINCT species_taxid) FROM metadata_all').fetchone()[0] == 2
    assert 'species_taxid' not in [row[0] for row in con.sql('DESCRIBE metadata').fetchall()]
    assert con.sql('SELECT DISTINCT assembly_level FROM metadata_all').fetchone()[0] == 'Complete Genome'
    build_metadata(con,path,drop_empty=False)
    assert con.sql('SELECT COUNT(*) FROM metadata').fetchone()[0] == 3
    con.close()


def test_duplicate_accession_fails_before_replacing_metadata(tmp_path):
    con = duckdb.connect()
    path = metadata_tsv(tmp_path)
    build_metadata(con,path)
    lines = path.read_text().splitlines()
    path.write_text('\n'.join(lines+[lines[1]])+'\n')
    with pytest.raises(ValueError,match='one nonempty accession'):
        build_metadata(con,path)
    assert con.sql('SELECT COUNT(*) FROM metadata_all').fetchone()[0] == 3
    con.close()


def test_prediction_ingest_drops_placeholder_and_invalid_length(tmp_path):
    path = tmp_path/'GCF_009914755.1_test.zseeker.csv'
    path.write_text('Chromosome,Start,End,Z-DNA Score,Sequence\nNC_060925.1,0,3,60,ACGT\nNA,NA,NA,NA,NA\nNC_060925.1,0,4,60,ACGT\n')
    con = duckdb.connect()
    rows = con.execute(select_from(q(str(path)))).fetchall()
    assert rows == [('NC_060925.1',0,3,60.0,'ACGT','GCF_009914755.1')]
    con.close()


def test_t2t_flags_survive_full_and_metadata_only_builds(tmp_path):
    con = duckdb.connect()
    path = metadata_tsv(tmp_path)
    con.execute('CREATE TABLE _asm_t2t (assembly VARCHAR, is_t2t BOOLEAN)')
    con.execute("INSERT INTO _asm_t2t VALUES ('GCF_000000000.1', true)")
    build_metadata(con, path)
    assert con.sql("SELECT is_t2t FROM metadata_all WHERE assembly='GCF_000000000.1'").fetchone()[0]
    con.execute('DROP TABLE _asm_t2t')
    build_metadata(con, path)
    assert con.sql("SELECT is_t2t FROM metadata_all WHERE assembly='GCF_000000000.1'").fetchone()[0]
    con.close()


def test_verifier_rejects_prediction_summaries_that_disagree_with_data(tmp_path, monkeypatch):
    import common
    from verify import check_metadata
    con = duckdb.connect()
    path = metadata_tsv(tmp_path)
    monkeypatch.setattr(common, 'META_TSV', str(path))
    build_metadata(con, path)
    con.execute('CREATE TABLE data ("Start" BIGINT,"End" BIGINT,"Sequence" VARCHAR)')
    con.execute("INSERT INTO data VALUES (0,3,'ACGT')")
    assert not check_metadata(con)
    con.execute("INSERT INTO data SELECT 0,3,'ACGT' FROM range(5)")
    assert check_metadata(con)
    con.close()


def test_archive_inventory_accepts_integral_decimal_coordinates(tmp_path, monkeypatch):
    import io
    import json
    import tarfile
    import audit_archive
    path = tmp_path / 'input.tar.gz'
    content = b'Chromosome,Start,End,Z-DNA Score,Sequence\nNC_060925.1,0.0,3.0,60,ACGT\nNC_060926.1,,,,\n'
    with tarfile.open(path, 'w:gz') as tar:
        member = tarfile.TarInfo('all_zseeker_final/GCF_009914755.1_test.zseeker.csv')
        member.size = len(content)
        tar.addfile(member, io.BytesIO(content))
    output = tmp_path / 'inventory.csv'
    monkeypatch.setattr(sys, 'argv', ['audit_archive.py', str(path), str(output)])
    audit_archive.main()
    report = json.loads(output.with_suffix('.json').read_text())
    assert report['records'] == 2
    assert report['small_file_placeholder_records'] == 1


def test_rebuild_uses_actual_loci_instead_of_stale_zero_metadata(tmp_path):
    from release import recompute_observed
    con = duckdb.connect()
    path = metadata_tsv(tmp_path)
    build_metadata(con, path)
    con.execute('CREATE TABLE data (assembly VARCHAR, "Sequence" VARCHAR, "Z-DNA Score" FLOAT)')
    # The TSV's second assembly was zero; the source actually has two loci.
    con.execute("INSERT INTO data VALUES ('GCF_000000001.1','ACGT',60),('GCF_000000001.1','ACGTAC',70)")
    recompute_observed(con)
    assert con.sql("SELECT obs_n_zdna,obs_zbp,obs_density_per_kb FROM metadata_all WHERE assembly='GCF_000000001.1'").fetchone() == (2,10,100.0)
    assert con.sql('SELECT assembly FROM metadata').fetchall() == [('GCF_000000001.1',)]
    from verify import EXPECTED
    assert [(r[0], r[1]) for r in con.sql('DESCRIBE metadata_all').fetchall()] == EXPECTED['metadata_all']
    assert con.sql('SELECT COUNT(*) FROM metadata_all').fetchone()[0] == 3
    con.close()



def test_full_derived_build_matches_schema_and_replays_portal_queries(tmp_path,monkeypatch):
    import common
    import build_meta_stats as builder
    from release import recompute_observed
    from verify import check_schema,check_metadata,joins,replay
    con=duckdb.connect()
    path=metadata_tsv(tmp_path)
    monkeypatch.setattr(common,'META_TSV',str(path))
    monkeypatch.setattr(builder,'LOG',str(tmp_path/'derived.log'))
    con.execute('CREATE TABLE data ("Chromosome" VARCHAR,"Start" BIGINT,"End" BIGINT,"Z-DNA Score" FLOAT,"Sequence" VARCHAR,assembly VARCHAR)')
    con.execute("INSERT INTO data VALUES ('chr1',0,3,60,'ACGT','GCF_000000000.1'),('chr2',4,7,70,'ACGT','GCF_000000001.1')")
    build_metadata(con,path);recompute_observed(con)
    builder.build_aux(con);builder.build_stats(con);builder.build_views(con)
    assert check_schema(con)
    assert check_metadata(con)
    assert joins(con)
    assert replay(con)
    assert con.sql('SELECT total_sites,distinct_chr,avg_score,min_score,max_score,avg_seq_len,distinct_asm FROM data_kpis').fetchone()==(2,2,65,60,70,4,2)
    con.close()


def test_final_metadata_t2t_flag_is_preserved_without_raw_filenames(tmp_path):
    path=metadata_tsv(tmp_path)
    rows=list(csv.DictReader(path.open(),delimiter='\t'))
    fields=[*rows[0],'is_t2t']
    with path.open('w') as f:
        writer=csv.DictWriter(f,fields,delimiter='\t');writer.writeheader()
        for i,row in enumerate(rows):row['is_t2t']='true' if i==0 else 'false';writer.writerow(row)
    con=duckdb.connect();build_metadata(con,path)
    assert con.sql("SELECT is_t2t FROM metadata_all WHERE assembly='GCF_000000000.1'").fetchone()[0]
    con.close()


def test_published_parquet_reconstruction_restores_native_names(tmp_path):
    import os,subprocess
    path=metadata_tsv(tmp_path)
    rows=list(csv.DictReader(path.open(),delimiter='\t'));fields=[*rows[0],'is_t2t']
    rows[0]['assembly']='GCF_009914755.1'
    with path.open('w') as f:
        writer=csv.DictWriter(f,fields,delimiter='\t');writer.writeheader()
        for i,row in enumerate(rows):
            row['Z-DNA/-RNA predictions count']=str([2,1,0][i]);row['is_t2t']='true' if i==0 else 'false';writer.writerow(row)
    con=duckdb.connect()
    con.execute('CREATE TABLE published ("Chromosome" VARCHAR,"Start" BIGINT,"End" BIGINT,"Z-DNA Score" FLOAT,"Sequence" VARCHAR,assembly VARCHAR)')
    con.execute("INSERT INTO published VALUES ('1',0,3,60,'ACGT','GCF_009914755.1'),('NC_060949.1',4,7,70,'ACGT','GCF_009914755.1'),('1',0,3,60,'ACGT','GCF_000000001.1')")
    shard=tmp_path/'data.parquet';con.execute(f"COPY published TO '{shard}' (FORMAT PARQUET)");con.close()
    target=tmp_path/'rebuilt.duckdb'
    script=Path(__file__).resolve().parents[1]/'import_release.py'
    result=subprocess.run([sys.executable,str(script),str(shard),str(path),str(target)],capture_output=True,text=True,env=dict(os.environ))
    assert result.returncode==0,result.stdout+result.stderr
    con=duckdb.connect(str(target),read_only=True)
    assert con.sql("SELECT \"Chromosome\" FROM data WHERE assembly='GCF_009914755.1' ORDER BY \"Start\"").fetchall()==[('NC_060925.1',),('NC_060949.1',)]
    assert con.sql("SELECT \"Chromosome\" FROM data WHERE assembly='GCF_000000001.1'").fetchone()[0]=='1'
    assert con.sql("SELECT is_t2t FROM metadata_all WHERE assembly='GCF_009914755.1'").fetchone()[0]
    con.close()
