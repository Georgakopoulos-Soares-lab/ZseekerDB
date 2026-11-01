"""Verify overlapping dinucleotide counting independently of SQL replacement."""
import collections
import sys
from pathlib import Path
import duckdb
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from figure6 import steps_query, PAIRS


def test_steps_do_not_cross_locus_boundaries_and_preserve_ambiguous_steps():
    con=duckdb.connect()
    con.execute('CREATE TABLE data (assembly VARCHAR,"Sequence" VARCHAR)')
    seqs=['GCGCGTGTACACATAT','acgtNACGT','A']
    con.executemany('INSERT INTO data VALUES (?,?)',[('a',seq) for seq in seqs])
    counts=collections.Counter(''.join(pair) for seq in seqs for pair in zip(seq.upper(),seq.upper()[1:]))
    expected=('a',sum(max(len(seq)-1,0) for seq in seqs),*(sum(counts[pair] for pair in pairs) for pairs in PAIRS.values()))
    assert con.execute(steps_query()).fetchone()==expected
    con.close()
