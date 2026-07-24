"""Regression tests for the 2-bit DNA codec (seqcodec.encode/decode).

These pin the *sequence logic* so the BLOB space-saving change can be proven
lossless and behaviour-preserving.
"""
import os
import glob
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import seqcodec as sc


def _rand_seq(rng, n):
    return "".join(rng.choice("ACGT") for _ in range(n))


# ---------------------------------------------------------------- round-trip
def test_empty():
    assert sc.decode(sc.encode("")) == ""


def test_single_bases():
    for b in "ACGT":
        assert sc.decode(sc.encode(b)) == b, b


def test_all_lengths_1_to_260():
    rng = random.Random(1234)
    for n in range(1, 261):  # crosses many byte + varint boundaries (127/128)
        s = _rand_seq(rng, n)
        assert sc.decode(sc.encode(s)) == s, (n, s)


def test_padding_boundaries():
    # lengths where padding = 0,1,2,3
    for base in ("", "A", "AC", "ACG", "ACGT", "ACGTA", "ACGTAC", "ACGTACG"):
        assert sc.decode(sc.encode(base)) == base


def test_homopolymers():
    for c in "ACGT":
        for n in (1, 3, 4, 5, 100, 1000):
            s = c * n
            assert sc.decode(sc.encode(s)) == s, (c, n)


# ---------------------------------------------------------------- fallback path
def test_non_acgt_fallback_roundtrip():
    for s in ["N", "ACGTN", "NNNN", "acgt", "AcGt", "ACGT-ACGT", "ACGU",
              "ACG T", "R", "ACGTRYSWKM", "123", "ACGTN" * 50]:
        assert sc.decode(sc.encode(s)) == s, repr(s)


def test_tag_bytes():
    assert sc.encode("ACGT")[0] == 0x00        # pure ACGT -> packed
    assert sc.encode("")[0] == 0x01            # empty -> raw fallback (1 byte, still lossless)
    assert sc.encode("ACGTN")[0] == 0x01       # has N -> raw fallback
    assert sc.encode("acgt")[0] == 0x01        # lowercase -> raw fallback


def test_unicode_fallback():
    s = "ACGTéñ"  # accented chars force fallback; must still round-trip
    assert sc.decode(sc.encode(s)) == s


# ---------------------------------------------------------------- size guarantee
def test_pure_acgt_shrinks():
    rng = random.Random(7)
    s = _rand_seq(rng, 4000)
    enc = sc.encode(s)
    # payload is ~len/4 plus a couple header bytes -> must be well under raw
    assert len(enc) < len(s.encode()) / 3, (len(enc), len(s))


def test_canonical_reencode_stable():
    # decode then re-encode must reproduce the identical blob (idempotent canonical form)
    rng = random.Random(99)
    for _ in range(200):
        s = _rand_seq(rng, rng.randint(0, 300))
        b = sc.encode(s)
        assert sc.encode(sc.decode(b)) == b


def test_varint_multi_byte_length():
    # length 200 needs a 2-byte varint; make sure that decodes right
    s = "ACGT" * 500  # len 2000
    assert sc.decode(sc.encode(s)) == s


# ---------------------------------------------------------------- batch == scalar
def test_encode_batch_matches_scalar():
    rng = random.Random(555)
    seqs = [_rand_seq(rng, rng.randint(0, 120)) for _ in range(500)]
    seqs += ["N", "acgt", "", "ACGTN"]
    assert sc.encode_batch(seqs) == [sc.encode(s) for s in seqs]


# ---------------------------------------------------------------- real data (optional)
_CSV_DIR = "/scratch/10899/kimopro/ZSeekerDB_migration/build/csv"


def test_real_sequences_roundtrip():
    import csv
    files = sorted(glob.glob(os.path.join(_CSV_DIR, "*.zseeker.csv")))
    if not files:
        import pytest
        pytest.skip("real CSV sample not present")
    picks = [files[i] for i in (0, 5000, 80000, 200000, 320000) if i < len(files)]
    n = 0
    for p in picks:
        with open(p) as f:
            r = csv.reader(f)
            next(r, None)
            for row in r:
                if len(row) < 5:
                    continue
                s = row[4]
                assert sc.decode(sc.encode(s)) == s, (p, s)
                n += 1
                if n % 50000 == 0:
                    break
    assert n > 0
