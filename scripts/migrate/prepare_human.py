"""Prepare the assigned human CSV and a BED4 companion, preserving source files.

BED column 4 records the original (unscaled) ZSeeker score as a locus name;
there is no BED score column, whose legal 0–1000 range differs from ZSeeker.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

HUMAN = 'GCF_009914755.1'
ALIASES = {f'NC_{60925+i:06d}.1': str(i+1) if i < 22 else ['X', 'Y'][i-22] for i in range(24)}


def convert(source, output):
    source, output = Path(source), Path(output)
    if not source.name.startswith(HUMAN + '_'):
        raise ValueError('Only the assigned human assembly may be renamed')
    output.mkdir(parents=True, exist_ok=True)
    csv_path = output / source.name
    bed_path = output / (source.stem + '.bed')
    if csv_path.resolve() == source.resolve():
        raise ValueError('Output must not overwrite the source')
    counts = {}
    n = renamed = 0
    try:
        with source.open() as inp, csv_path.open('x', newline='') as csv_out, bed_path.open('x', newline='') as bed_out:
            reader = csv.DictReader(inp)
            if reader.fieldnames != ['Chromosome', 'Start', 'End', 'Z-DNA Score', 'Sequence']:
                raise ValueError('Unexpected ZSeeker CSV schema')
            writer = csv.DictWriter(csv_out, reader.fieldnames)
            writer.writeheader()
            bed = csv.writer(bed_out, delimiter='\t', lineterminator='\n')
            for row in reader:
                start, end = int(row['Start']), int(row['End'])
                if start < 0 or end < start or end-start+1 != len(row['Sequence']):
                    raise ValueError(f'Invalid inclusive coordinates at record {n+1}')
                original = row['Chromosome']
                row['Chromosome'] = ALIASES.get(original, original)
                writer.writerow(row)
                bed.writerow([row['Chromosome'], start, end+1, 'ZSeeker_score='+row['Z-DNA Score']])
                n += 1
                renamed += row['Chromosome'] != original
                counts[row['Chromosome']] = counts.get(row['Chromosome'], 0) + 1
    except Exception:
        # Never delete existing output files on a failed exclusive open.
        raise
    manifest = dict(assembly=HUMAN, rows=n, renamed_rows=renamed, chromosomes=counts,
                    csv_coordinates='0-based, inclusive end', bed_coordinates='0-based, half-open end',
                    bed_fields=['chrom', 'chromStart', 'chromEnd', 'name (original ZSeeker score)'],
                    sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [csv_path, bed_path]})
    # Input and output CSV have the same basename; keep the source digest distinct.
    manifest['source_sha256'] = hashlib.sha256(source.read_bytes()).hexdigest()
    (output/'human_manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source'); parser.add_argument('output')
    args = parser.parse_args()
    print(json.dumps(convert(args.source, args.output), indent=2))


if __name__ == '__main__':
    main()
