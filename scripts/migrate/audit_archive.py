"""Stream the source tar.gz once; inventory every CSV without extracting it.

Counts physical CSV records (the five source fields contain no embedded newlines).
Small files are parsed to distinguish empty-assembly placeholders from predictions.
Large files are counted in chunks; this is an inventory, not full row validation.
"""
import argparse
import csv
import io
import json
import math
import re
import tarfile
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("archive")
    ap.add_argument("output")
    args = ap.parse_args()
    out = Path(args.output)
    total = placeholders = files = 0
    with tarfile.open(args.archive, "r|gz") as tar, out.open("w") as inventory:
        writer = csv.writer(inventory)
        writer.writerow(["assembly", "member", "bytes", "records", "placeholder_records"])
        for member in tar:
            if not member.isfile() or not member.name.endswith(".zseeker.csv"):
                continue
            match = re.match(r"(GC[AF]_\d+\.\d+)", Path(member.name).name)
            if not match:
                raise ValueError(f"No stable assembly accession: {member.name}")
            source = tar.extractfile(member)
            header = source.readline().decode().strip()
            if header != "Chromosome,Start,End,Z-DNA Score,Sequence":
                raise ValueError(f"Unexpected header in {member.name}: {header}")
            n = empty = 0
            if member.size < 4096:
                for row in csv.reader(io.StringIO(source.read().decode())):
                    if not row:
                        continue
                    n += 1
                    try:
                        start, end, score = map(float, row[1:4])
                        valid = all(math.isfinite(v) for v in [start, end, score]) and start.is_integer() and end.is_integer() and row[0] not in ("", "NA", "N/A") and row[4] not in ("", "NA", "N/A")
                    except (ValueError, IndexError):
                        valid = False
                    empty += not valid
            else:
                last = b""
                while block := source.read(4 * 1024 * 1024):
                    n += block.count(b"\n")
                    last = block[-1:]
                n += bool(last and last != b"\n")
            writer.writerow([match[1], member.name, member.size, n, empty])
            total += n
            placeholders += empty
            files += 1
            if files % 5000 == 0:
                inventory.flush()
                print(f"{files:,} files; {total:,} records; uncompressed offset {tar.fileobj.tell():,}", flush=True)
    summary = dict(files=files, records=total, small_file_placeholder_records=placeholders,
                   complete=True, notes="Physical records include placeholders; large-file row validity and mixed placeholders are not fully checked. This is not a prediction count.")
    out.with_suffix(".json").write_text(json.dumps(summary, indent=2) + "\n")
    print(summary, flush=True)


if __name__ == "__main__":
    main()
