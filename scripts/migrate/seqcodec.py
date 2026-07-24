"""Lossless 2-bit DNA codec for the Z-DNA `Sequence` column.

Layout of an encoded BLOB (self-describing, so decode needs nothing else):

  byte 0 : tag
           0x00 -> 2-bit packed pure-uppercase-ACGT sequence
           0x01 -> raw fallback (any other content: N, lowercase, empty-with-weird, etc.)
  tag 0x00:  [uvarint length][ceil(length/4) packed bytes]  (2 bits/base, A=0 C=1 G=2 T=3, MSB-first)
  tag 0x01:  [raw UTF-8 bytes of the original string]

Design notes:
  * Real Z-DNA sequences are pure uppercase ACGT (verified on a 236k sample), so
    the vast majority take the 0x00 path and shrink ~4x on the payload.
  * Anything not pure-uppercase-ACGT (rare/none) falls back to raw bytes -> still
    perfectly lossless, never throws.
  * `encode(decode(b)) == b` for canonical inputs and, crucially for a migration,
    `decode(encode(s)) == s` for ALL str inputs.
"""

_ACGT = b"ACGT"
_ENC_TR = bytes.maketrans(_ACGT, bytes([0, 1, 2, 3]))
# 256-entry lookup: each packed byte -> its 4 bases (MSB-first)
_B2S = ["".join("ACGT"[(b >> s) & 3] for s in (6, 4, 2, 0)) for b in range(256)]


def _uvarint_encode(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _uvarint_decode(buf: bytes, i: int):
    shift = 0
    val = 0
    while True:
        b = buf[i]
        i += 1
        val |= (b & 0x7F) << shift
        if not (b & 0x80):
            return val, i
        shift += 7


def _is_pure_acgt(raw: bytes) -> bool:
    # translate ACGT->0..3, leave others unchanged; pure iff every byte < 4
    return bool(raw) and max(raw.translate(_ENC_TR)) < 4


def encode(s: str):
    """Encode a sequence string to a compact, lossless BLOB (bytes). NULL -> None."""
    if s is None:
        return None
    raw = s.encode("utf-8")
    if _is_pure_acgt(raw):
        codes = raw.translate(_ENC_TR)  # bytes valued 0..3
        n = len(codes)
        pad = (-n) % 4
        if pad:
            codes = codes + b"\x00" * pad
        packed = bytearray(len(codes) // 4)
        for i in range(0, len(codes), 4):
            packed[i >> 2] = (codes[i] << 6) | (codes[i + 1] << 4) | (codes[i + 2] << 2) | codes[i + 3]
        return b"\x00" + _uvarint_encode(n) + bytes(packed)
    return b"\x01" + raw


def decode(b: bytes):
    """Decode a BLOB produced by encode() back to the exact original string. None -> None."""
    if b is None:
        return None
    if not b:
        return ""
    tag = b[0]
    if tag == 0x00:
        n, i = _uvarint_decode(b, 1)
        chars = []
        for byte in b[i:]:
            chars.append(_B2S[byte])
        return ("".join(chars))[:n]
    if tag == 0x01:
        return b[1:].decode("utf-8")
    raise ValueError(f"bad codec tag {tag!r}")


# ---- optional numpy-accelerated batch encoder (used by the migration at scale) ----
def encode_batch(seqs):
    """Encode an iterable of strings -> list of bytes. Falls back to per-item encode()."""
    try:
        import numpy as np
    except Exception:
        return [encode(s) for s in seqs]
    out = []
    for s in seqs:
        if s is None:
            out.append(None)
            continue
        raw = s.encode("utf-8")
        if _is_pure_acgt(raw):
            a = np.frombuffer(raw.translate(_ENC_TR), dtype=np.uint8)
            n = a.size
            pad = (-n) % 4
            if pad:
                a = np.concatenate([a, np.zeros(pad, np.uint8)])
            a = a.reshape(-1, 4)
            packed = ((a[:, 0] << 6) | (a[:, 1] << 4) | (a[:, 2] << 2) | a[:, 3]).astype(np.uint8)
            out.append(b"\x00" + _uvarint_encode(n) + packed.tobytes())
        else:
            out.append(b"\x01" + raw)
    return out


def register_duckdb_udfs(con):
    """Register seq_encode(VARCHAR)->BLOB and seq_decode(BLOB)->VARCHAR on a duckdb con."""
    from duckdb.typing import BLOB, VARCHAR
    con.create_function("seq_encode", encode, [VARCHAR], BLOB)
    con.create_function("seq_decode", decode, [BLOB], VARCHAR)
