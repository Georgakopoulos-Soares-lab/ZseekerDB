"""Copying an existing native database must preserve inclusive coordinates."""
import sys
from pathlib import Path

import duckdb
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rebuild_release import stage_data


def make_source(path, malformed=False):
    con = duckdb.connect(str(path))
    con.execute('''CREATE TABLE data ("Chromosome" VARCHAR, "Start" BIGINT,
      "End" BIGINT, "Z-DNA Score" FLOAT, "Sequence" VARCHAR, assembly VARCHAR)''')
    con.execute("INSERT INTO data VALUES ('native',0,3,50,'ACGT','GCA_947361175.1'), ('empty',NULL,NULL,NULL,NULL,'zero')")
    if malformed:
        con.execute("INSERT INTO data VALUES ('bad',0,4,50,'ACGT','a')")
    con.close()


def test_copy_preserves_native_loci_and_assemblies(tmp_path):
    source = tmp_path / 'source.duckdb'
    make_source(source)
    con = duckdb.connect()
    try:
        stage_data(con, source)
        assert con.execute('SELECT * FROM data').fetchall() == [('native', 0, 3, 50.0, 'ACGT', 'GCA_947361175.1')]
        stage_data(con, source)
        assert con.execute('SELECT COUNT(*) FROM data').fetchone()[0] == 1
    finally:
        con.close()


def test_copy_rejects_invalid_intervals_before_creating_data(tmp_path):
    source = tmp_path / 'source.duckdb'
    make_source(source, malformed=True)
    con = duckdb.connect()
    try:
        with pytest.raises(ValueError, match='malformed'):
            stage_data(con, source)
        assert not con.execute("SELECT * FROM information_schema.tables WHERE table_name='data'").fetchall()
    finally:
        con.close()
