"""Prove the BLOB-encoded `Sequence` reproduces IDENTICAL query results to the
VARCHAR baseline, for the exact operations backend/main.go performs on sequences:

  * projection of the zdna columns (search/export/preview)
  * substring search:  LOWER("Sequence") LIKE '%...%'
  * score/position filters combined with sequence output
  * ordering by Z-DNA Score

Strategy: one in-memory DuckDB with a VARCHAR baseline table `data_v` and a
BLOB table `data_b` (Sequence -> seq_encode) exposed via a decoding view
`data_dec`. Any divergence fails the test.
"""
import os
import random
import sys

import duckdb

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import seqcodec as sc


def _make_rows(n=4000):
    rng = random.Random(2024)
    rows = []
    for i in range(n):
        L = rng.randint(10, 200)
        seq = "".join(rng.choice("ACGT") for _ in range(L))
        # sprinkle a few fallback-path sequences (N / lowercase) to test that path too
        if i % 337 == 0:
            seq = seq[:5] + "N" + seq[5:]
        chrom = f"CHR{i % 50}.1"
        start = rng.randint(1, 10_000_000)
        rows.append((chrom, start, start + L, round(rng.uniform(50, 500), 2), seq, f"GCA_{i%20:09d}.1"))
    return rows


def _con():
    con = duckdb.connect()
    sc.register_duckdb_udfs(con)
    con.execute('CREATE TABLE data_v ("Chromosome" VARCHAR,"Start" BIGINT,"End" BIGINT,'
                '"Z-DNA Score" DOUBLE,"Sequence" VARCHAR, assembly VARCHAR)')
    con.executemany("INSERT INTO data_v VALUES (?,?,?,?,?,?)", _make_rows())
    # BLOB table + decoding view that presents the SAME columns/types as data_v
    con.execute('CREATE TABLE data_b AS SELECT "Chromosome","Start","End","Z-DNA Score",'
                'seq_encode("Sequence") AS seq_packed, assembly FROM data_v')
    con.execute('CREATE VIEW data_dec AS SELECT "Chromosome","Start","End","Z-DNA Score",'
                'seq_decode(seq_packed) AS "Sequence", assembly FROM data_b')
    return con


def _both(con, sql):
    v = con.execute(sql.format(t="data_v")).fetchall()
    d = con.execute(sql.format(t="data_dec")).fetchall()
    return v, d


def test_full_projection_identical():
    con = _con()
    v, d = _both(con, 'SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" '
                      'FROM {t} ORDER BY "Chromosome","Start","End","Sequence"')
    assert v == d
    assert len(v) == 4000


def test_sequence_column_exact():
    con = _con()
    v, d = _both(con, 'SELECT "Sequence" FROM {t} ORDER BY "Start","Sequence"')
    assert v == d


def test_like_substring_search():
    con = _con()
    for needle in ("acgt", "gcgcgc", "acgtacgt", "n", "tttt", "zzz"):
        v, d = _both(con,
            f"SELECT \"Chromosome\",\"Start\",\"Sequence\" FROM {{t}} "
            f"WHERE LOWER(\"Sequence\") LIKE '%{needle}%' "
            f"ORDER BY \"Chromosome\",\"Start\",\"Sequence\"")
        assert v == d, needle


def test_score_filter_with_sequence():
    con = _con()
    v, d = _both(con, 'SELECT "Chromosome","Start","End","Z-DNA Score","Sequence" FROM {t} '
                      'WHERE "Z-DNA Score" >= 100 AND "Z-DNA Score" <= 300 '
                      'ORDER BY "Z-DNA Score","Start","Sequence"')
    assert v == d


def test_length_and_counts():
    con = _con()
    v, d = _both(con, 'SELECT LENGTH("Sequence") l, COUNT(*) c FROM {t} GROUP BY 1 ORDER BY 1')
    assert v == d
    # sanity: baseline and decoded agree on total sequence characters
    tv = con.execute('SELECT SUM(LENGTH("Sequence")) FROM data_v').fetchone()[0]
    td = con.execute('SELECT SUM(LENGTH(seq_decode(seq_packed))) FROM data_b').fetchone()[0]
    assert tv == td


def test_zdna_view_shape():
    # mirror the backend zdna view (adds Assembly) over the decoded table
    con = _con()
    con.execute('CREATE VIEW zdna AS SELECT "Chromosome","Start","End","Z-DNA Score",'
                'seq_decode(seq_packed) AS "Sequence", assembly AS "Assembly" FROM data_b')
    cols = [c[0] for c in con.execute("DESCRIBE zdna").fetchall()]
    assert cols == ["Chromosome", "Start", "End", "Z-DNA Score", "Sequence", "Assembly"]
    row = con.execute('SELECT * FROM zdna LIMIT 1').fetchone()
    assert isinstance(row[4], str)
