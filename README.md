# ZSeekerDB

ZSeekerDB links sequence-based predictions of Z-forming potential to organismal
and viral genome assemblies. A Go API queries one DuckDB file; React provides
sequence search, assembly browsing, plots and downloads. RNA-virus records are
scored as cDNA sequences; these scores are not experimental validation of Z-RNA
formation.

[Open the portal](https://zseeker-db.com/) ·
[Database build documentation](scripts/migrate/README.md) ·
[Dataset construction and figure scripts](scripts/benchmarking/)

## Verified catalog

The database built on 27 October 2026 contains:

| Metric | Value |
| --- | ---: |
| All genome assemblies | 324,198 |
| Assemblies with predictions | 148,215 |
| Assemblies without predictions | 175,983 |
| Species grouping identifiers | 60,841 |
| Predicted loci | 2,563,977,897 |
| Species-balanced mean genome size | 108,166,650 bp |
| Species-balanced mean G+C content | 47.7% |

Assembly attributes come from the assembly metadata TSV shipped as
`data/metadata.tsv.gz`. `genome_size_manual` is computed from each FASTA as
total bases minus N stretches (`scripts/benchmarking/04_genome_size.sh`);
prediction counts, predicted bases and densities (`z_bases / genome_size_manual`)
are computed from the ZSeeker output CSVs (`scripts/benchmarking/08_z_density.py`).
Genome-size statistics use `genome_size_manual`. Species grouping uses
`ncbi_summary_species_taxid` (loaded as `species_taxid`), rather than the
assembly/strain `ncbi_summary_taxid`. The metadata includes assemblies with no
predictions, and the Species Browser lists every assembly with
`genome_size_manual` of at least 1,000 bp, including those without predictions.

The assembly-metadata file in this repository, `data/metadata.tsv.gz`, has
SHA-256 `a8a6fdda522f8e76770afc7646f2a9e2d5ddc8b63e76744fbffa217a85617e25`.

## Dataset downloads

The **October 2026 datasets are public on Zenodo**: 23 downloadable archives
in 14 open records, published 26 October 2026. Every direct link below returned
HTTP 200 with the expected file size on 1 November 2026. The Downloads page
also lists each file's published MD5 checksum and its record/DOI.

| Scope | CSV | JSON | Parquet | BED |
| --- | --- | --- | --- | --- |
| Entire dataset | [![All CSV Part 1 of 2](https://img.shields.io/badge/CSV-Part%201%20of%202-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677639/files/zseeker_csv_part1.tar.gz?download=1) [![All CSV Part 2 of 2](https://img.shields.io/badge/CSV-Part%202%20of%202-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23678010/files/zseeker_csv_part2.tar.gz?download=1) | [![All JSON Part 1 of 2](https://img.shields.io/badge/JSON-Part%201%20of%202-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677625/files/zseeker_json_part1.tar.gz?download=1) [![All JSON Part 2 of 2](https://img.shields.io/badge/JSON-Part%202%20of%202-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677745/files/zseeker_json_part2.tar.gz?download=1) | [![All PARQUET Part 1 of 2](https://img.shields.io/badge/PARQUET-Part%201%20of%202-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677791/files/zseeker_parquet_part1.tar.gz?download=1) [![All PARQUET Part 2 of 2](https://img.shields.io/badge/PARQUET-Part%202%20of%202-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677789/files/zseeker_parquet_part2.tar.gz?download=1) | [![All BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677870/files/zseekerdb_bed.tar.gz?download=1) |
| Archaea | [![Archaea CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677150/files/archaea_CSV.tar.gz?download=1) | [![Archaea JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677146/files/archaea_JSON.tar.gz?download=1) | [![Archaea PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677152/files/archaea_PARQUET.tar.gz?download=1) | [![Archaea BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/archaea_BED.tar.gz?download=1) |
| Bacteria | [![Bacteria CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677150/files/bacteria_CSV.tar.gz?download=1) | [![Bacteria JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677146/files/bacteria_JSON.tar.gz?download=1) | [![Bacteria PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677152/files/bacteria_PARQUET.tar.gz?download=1) | [![Bacteria BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/bacteria_BED.tar.gz?download=1) |
| Eukaryota | [![Eukaryota CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677533/files/eukaryota_CSV.tar.gz?download=1) | [![Eukaryota JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677610/files/eukaryota_JSON.tar.gz?download=1) | [![Eukaryota PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677297/files/eukaryota_PARQUET.tar.gz?download=1) | [![Eukaryota BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/eukaryota_BED.tar.gz?download=1) |
| Viruses | [![Viruses CSV Download](https://img.shields.io/badge/CSV-Download-2374ab?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677150/files/viruses_CSV.tar.gz?download=1) | [![Viruses JSON Download](https://img.shields.io/badge/JSON-Download-8e44ad?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677146/files/viruses_JSON.tar.gz?download=1) | [![Viruses PARQUET Download](https://img.shields.io/badge/PARQUET-Download-22863a?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677152/files/viruses_PARQUET.tar.gz?download=1) | [![Viruses BED Download](https://img.shields.io/badge/BED-Download-b05a00?logo=zenodo&logoColor=white)](https://zenodo.org/records/23677154/files/viruses_BED.tar.gz?download=1) |

For the complete dataset, download **both parts of the same CSV, JSON or Parquet
format**. The full archives are split by assembly accession; each part contains
the complete metadata. Individual superkingdom archives provide a smaller download.
Extract the `.tar.gz` files to access prediction and metadata tables.

The published records report **324,198 assemblies and 2,563,977,897 predictions**,
matching the portal catalog above. Use the metadata bundled with the downloaded
archives for their assembly attributes and counts.

**Archived BED coordinates:** the published four-column files contain chromosome,
start, native inclusive end and raw ZSeeker score. A checked locus is
`CP115555.1:605–655` (51 bp); for standard half-open BED it must be `605–656`.
Add one to the end before using these archived BED files with BED tools.
Archived chromosome accessions are preserved; only the portal names human
chromosomes 1–22, X, Y (see below).

## Database design

The database file `zdnadatabase_2026-10.duckdb` is built by `scripts/migrate`
(see [Data pipeline](#data-pipeline)). `assembly` is the join key between
predictions and assembly metadata. NCBI accessions retain their version suffix
(for example `GCF_009914755.1`).

| Object | Purpose |
| --- | --- |
| `data` | One row per predicted locus (2,563,977,897), stored with native chromosome accession |
| `metadata` | One row per assembly with predictions (148,215), built from the release TSV |
| `chromosomes` | Distinct chromosome accessions with predictions (5,042,470) |
| `tax_names` | Distinct `tax_name` values of assemblies with predictions and `genome_size` ≥1,000 bp (63,500) |
| `data_kpis` | Prediction-wide aggregate statistics |
| `data_top_asm` | Prediction counts grouped by assembly |
| `data_top_chrom` | Prediction counts grouped by chromosome accession |
| `zdna` | View: projection of `data`, exposing `assembly` as `Assembly` |
| `metadata_view` | View: display-name projection of `metadata`, restricted to `genome_size` ≥1,000 bp |

The DuckDB `metadata` table holds only assemblies with predictions. The portal
therefore does not query it: at startup it loads the complete assembly metadata,
`data/metadata.tsv.gz` (all 324,198 assemblies, including the 175,983 without
predictions), into an in-memory `metadata` table that replaces it. All homepage
counts, the Species browser, Species insights and Sequence search use this
complete table; assemblies without predictions report 0 predictions.

## Field-level schema

### Predictions (`data` and `zdna`)

| Field | DuckDB type | Meaning / units / example |
| --- | --- | --- |
| `Chromosome` | VARCHAR | Source sequence accession, e.g. `NC_060925.1` |
| `Start` | BIGINT | Zero-based start, inclusive; e.g. 2721 |
| `End` | BIGINT | Zero-based end, inclusive; e.g. 2744 |
| `Z-DNA Score` | FLOAT | ZSeeker sequence score, dimensionless; e.g. 96.5 |
| `Sequence` | VARCHAR | Predicted nucleotide sequence; length = End − Start + 1 |
| `assembly` | VARCHAR | Versioned assembly accession; `Assembly` in `zdna` |

CSV, TSV, JSON, XML and Excel result exports retain native inclusive ends.
BED uses zero-based, half-open intervals: `chromStart = Start`,
`chromEnd = End + 1`. Conversion must be explicit; renaming a CSV to BED is
not a coordinate conversion. GFF3 coordinates are one-based and inclusive.

For `GCF_009914755.1` only, the portal's `data` view renames
`NC_060925.1`–`NC_060948.1` to `1`–`22`, `X`, `Y`, so searches, filters, plots
and result exports use these names. Other assemblies and unmapped contigs keep
their source accessions. The DuckDB file itself keeps source coordinates and
source accession names.

### Assembly metadata

The portal's `metadata` table is loaded from `data/metadata.tsv.gz` with the
fields below. Empty text becomes SQL NULL (`na` too, for `infraspecific_name`
and `paired_asm_comp`); failed numeric conversions become NULL, not zero.
Taxonomy fields come from `scripts/benchmarking/06_add_taxonomy.py`; prediction
summaries from `scripts/benchmarking/08_z_density.py`.

| Field | Type | TSV source / definition |
| --- | --- | --- |
| `assembly` | VARCHAR | `assembly_accession`; unique accession, including assembly version |
| `taxid` | BIGINT | `ncbi_summary_taxid`; may identify a strain |
| `species_taxid` | BIGINT | `ncbi_summary_species_taxid`; species grouping key |
| `assembly_level` | VARCHAR | `resolve_level`; complete → Complete Genome, chromosome → Chromosome |
| `genome_size_manual` | BIGINT | bp, computed from the FASTA as total bases minus N stretches (`04_genome_size.sh`); the genome size used throughout the portal |
| `genome_size_ungapped` | BIGINT | `genome_size_ungapped`, bp, as reported by NCBI |
| `gc_percent` | DOUBLE | `gc_percent`, percentage points (0–100) |
| `superkingdom` | VARCHAR | `superkingdom`; e.g. Eukaryota |
| `kingdom` | VARCHAR | `kingdom`; e.g. Metazoa |
| `phylum` | VARCHAR | `phylum`; e.g. Chordata |
| `class` | VARCHAR | `class`; e.g. Mammalia |
| `order` | VARCHAR | `order`; e.g. Primates |
| `family` | VARCHAR | `family`; e.g. Hominidae |
| `genus` | VARCHAR | `genus`; e.g. Homo |
| `tax_name` | VARCHAR | `tax_name`; source taxon label, e.g. Homo sapiens |
| `species` | VARCHAR | `species` |
| `organism_name` | VARCHAR | `organism_name`, as in the NCBI assembly summary |
| `infraspecific_name` | VARCHAR | `infraspecific_name` |
| `viral_realm` | VARCHAR | `viral_realm` |
| `updated_tax_name` | VARCHAR | `updated_tax_name` |
| `replicon_count`, `scaffold_count`, `contig_count` | BIGINT | as reported by NCBI |
| `reference_genome` | BOOLEAN | `reference_genome` |
| `paired_asm_comp` | VARCHAR | `paired_asm_comp` |
| `obs_n_zdna` | BIGINT | `z_predictions_count`; number of predicted loci |
| `obs_zbp` | BIGINT | `total_z_bases`; bases covered by predicted loci, overlapping loci merged |
| `obs_density_per_kb` | DOUBLE | `z_density` × 1,000; predicted bp per 1,000 bp of `genome_size_manual` |

The DuckDB `metadata` table has the same fields plus `genome_size` (the NCBI
reported size), `is_t2t` (T2T in the source filename) and `has_gff`, for the
148,215 assemblies with predictions.

Additional source TSV attributes are retained in the archived TSV, not silently
promoted to queryable fields. Taxonomy normalization, including the Protists and viral-realm assignments, is reproduced by scripts/benchmarking/06_add_taxonomy.py All supplied taxon labels are retained.

### Auxiliary fields

| Object | Fields and types |
| --- | --- |
| `chromosomes` | `Chromosome VARCHAR` |
| `tax_names` | `tax_name VARCHAR` |
| `data_kpis` | `total_sites BIGINT`, `distinct_chr BIGINT`, `avg_score DOUBLE`, `min_score DOUBLE`, `max_score DOUBLE`, `avg_seq_len DOUBLE`, `distinct_asm BIGINT`, `computed_at TIMESTAMP WITH TIME ZONE` |
| `data_top_asm`, `data_top_chrom` | `k VARCHAR` (assembly or chromosome), `c BIGINT` (locus count) |

`metadata_view` exposes `assembly`, `T2T`, `Genome size` (from `genome_size`),
`Taxon ID`, `GC content (%)`, all eight taxonomic name/rank fields,
`Viral realm`, `Infraspecific name` (legacy name for `updated_tax_name`),
`Z-DNA bps`, `Z-DNA density (per kb)`, and `Number of predicrions` (legacy
spelling). Types are inherited unchanged.

## Summary statistics

Homepage genome size (`genome_size_manual`) and GC are calculated in two
stages: average the assembly values within each `species_taxid`, then average
those species means. Missing values are omitted independently for each metric.
Kingdom density uses the same two-stage averaging within each kingdom,
including zero densities for assemblies without predictions, over assemblies
with `genome_size_manual` of at least 1,000 bp, and excludes names containing
`unclassified` before ranking the ten highest kingdoms. Species balancing
reduces multiple-assembly weighting; it is not a correction for phylogenetic
dependence.

The two superkingdom charts count assemblies and unique species taxids with
`genome_size_manual` of at least 1,000 bp; in this release every assembly
qualifies, so the assembly bars sum to the assembly KPI. The score histogram
uses a deterministic hash sample averaging about four predictions per species
grouping ID. All homepage results are computed once at startup and served
from memory for the life of the process.

Chromosome plots count loci in ten equal-width windows by their zero-based
`Start`; genome-wide plots count loci per chromosome. These are locus counts,
not predicted base-pair densities. Per-chromosome reference lengths are not
stored: the window extent is the assembly genome size for single-sequence
assemblies, otherwise it runs to the last predicted base (`MAX(End) + 1`).

## Data pipeline

### Dataset construction (`scripts/benchmarking`)

1. `01_download_ncbi.sh`: NCBI assembly summaries (GenBank and RefSeq) and the
   NCBI taxonomy dump.
2. `02_select_assemblies.py`: select assemblies from the summaries (all
   Complete Genome assemblies, plus chromosome-level reference genomes for
   taxids without one; see the script for the full criteria).
3. `03_download_genomes.sh`: download and verify the genome FASTA files.
4. `04_genome_size.sh`: `genome_size_manual`, total bases minus N stretches.
5. `05_filter_dedup.py`: filter assembly types and groups, and remove
   GenBank/RefSeq duplicates.
6. `06_add_taxonomy.py`: NCBI ranked lineage, superkingdom, viral realm and
   Protists assignments.
7. `07_run_zseeker.sh`: run ZSeeker on every assembly, one CSV per assembly.
8. `08_z_density.py`: per-assembly locus counts, covered bases (overlapping
   loci merged) and `z_density = z_bases / genome_size_manual`.

Scripts 09–16 produce the manuscript analyses: genome and locus dinucleotide
composition (09–11, Figure 6A–D statistics), comparison with nBMST predictions
on the human and mouse T2T assemblies (12–13), the Rps6kl1 locus in the mouse
T2T assembly (14–15), and the Figure 6 plots (16).

### Database build (`scripts/migrate`)

Use **DuckDB 1.1.3**, matching **go-duckdb 1.8.5**, for database-file
compatibility. Inputs are the per-assembly ZSeeker CSVs
(`all_zseeker_final.tar.gz`) and the 31-column release TSV with 324,198
assemblies (`MIG_META_TSV`).

- Placeholder rows that ZSeeker writes for sequences without predictions
  (`Chromosome,,,,`; 24,116,216 rows) are dropped, so `data` holds real
  predictions only.
- Assemblies without predictions are dropped from the DuckDB `metadata` table
  (`MIG_DROP_EMPTY_ASSEMBLIES=1`, default): 175,983 of 324,198, leaving
  148,215. The portal restores them from the complete TSV at runtime.
- TSV to DB mapping: `assembly_accession` → `assembly`, `ncbi_summary_taxid` →
  `taxid`, `resolve_level` → `assembly_level`, `z_predictions_count` →
  `obs_n_zdna`, `total_z_bases` → `obs_zbp`, `z_density` × 1,000 →
  `obs_density_per_kb`; `is_t2t` is "T2T" in the source filename.
- `chromosomes` and `tax_names` list only chromosomes and species with
  predictions.

This release was built incrementally with `rebuild_release.py
[data|metadata|derived]`, which copies `data` from the July build with the
rules above and rebuilds `metadata` and the derived tables. A build from
scratch extracts the tarball to `build/csv` and runs `run_all.sh` (`audit.py` →
`build_data.py` → `build_meta_stats.py` → `verify.py`). Both share the
metadata, derived-table and view SQL in `release.py`. Paths and tunables are set
in `scripts/migrate/common.py` and its `MIG_*` environment variables.

`verify.py [db]` opens the database read-only and checks the schema, the absence
of NULL and placeholder rows, per-assembly counts and bases against `metadata`,
orphans in both directions, density units, and a replay of the endpoint and
frontend SQL. It exits non-zero on any failure. The two-bit sequence codec
(`seqcodec.py`) was a space-reduction experiment and is not used; `Sequence`
is stored as VARCHAR.

```bash
python3 scripts/migrate/verify.py /path/to/zdnadatabase_2026-10.duckdb
python3 -m pytest scripts/migrate/tests/ -q
```

## Web interface and implementation

The checked-in manifests specify Gin **1.10.1**, go-duckdb **1.8.5**, Go **1.24**
(toolchain **1.24.5**), React **^19.1.1**, Material UI **^7.3.1**, ECharts **^5.6.0**,
echarts-for-react **^3.0.2**, Vite **^7.1.2**, and TypeScript **~5.8.3**.
`frontend/package-lock.json` pins the resolved JavaScript dependencies. These
are the code's versions; historical manuscript dependency numbers are not used
as a substitute for the manifests.

The frontend's Explorer builds analytical SELECT queries for the API. Assembly
search links use stable accessions; human chromosome names come from the
backend `data` view. Server CSV exports stream rows; client CSV, TSV, JSON,
XML and Excel (HTML `.xls`) exports are capped at one million rows and fetched
in 50,000-row batches.

## API and SQL safeguards

Used by the React UI:

- `GET /api/home/insights`: homepage KPIs and charts, computed once at startup.
- `GET /api/metadata/list`, `/export`, `/charts`, `/distinct`: Species browser
  table, downloads (CSV, TSV, JSON, XML, XLS), charts and filter options; all
  take the same taxonomy/range filter parameters.
- `GET /api/sql?query=...` or `POST /api/sql` with `{"sql":"SELECT ..."}`:
  a single validated, read-only SELECT query.

Other routes:

- `GET /api/health`: health, including unavailable database status.
- `GET /api/zdna/search`, `/export`, `/score_histogram`: raw predictions for one
  assembly; `assembly_eq=<accession>` is required.
- `GET /api/zdna/distinct_chr`, `/api/metadata/classes/top`,
  `/api/metadata/preview`, `/api/zdna/preview`.
- `POST /api/admin/init`: recreates views; disabled unless `ADMIN_TOKEN` is set,
  and then requires the same value in the `X-Admin-Token` header.

SQL requests must be exactly one statement beginning with `SELECT`. DuckDB's own
parser validates the request (`json_serialize_sql` serializes only SELECT
statements, one entry per statement), so chained statements and write, DDL,
ATTACH, COPY, EXPORT, INSTALL, LOAD, PRAGMA and SET commands are rejected. After
startup the engine sets `enable_external_access = false` and
`lock_configuration = true`, so no query can read or write files or the
network or change these settings. A query is cancelled when its client
disconnects. Large downloads should use the archived datasets.

## Deployment and local validation

The Docker image builds React and serves it from Go in one Railway service.
Mount a volume at `/data`, place the database at `/data/zdnadatabase.duckdb`,
and set `DUCKDB_PATH` accordingly. `PORT` is supplied by Railway. Optional
`CORS_ORIGIN` is a comma-separated origin list; it is not needed with the
bundled frontend.

At startup the backend attaches the DuckDB file **read-only** as `zdb` and
exposes its tables under their usual names, except `metadata`. The DuckDB
`metadata` table only holds assemblies with predictions, so the backend loads
`data/metadata.tsv.gz` (`METADATA_GLOB`; included in the Docker image) into an
in-memory `metadata` table with all release assemblies, including those with
no predictions. That table uses `genome_size_manual` as the only genome size
(the TSV's raw `genome_size` is not loaded) and takes prediction counts,
predicted bases and density (`z_density` × 1,000, per kb) from the TSV. The
`data` view applies the human chromosome names described above. The volume is
never modified.

Without the database or the metadata TSV the service starts with degraded
health (HTTP 200, `"status":"degraded"`) and data routes return 503; restart
after installing the file. Database files are excluded from Git.

| Variable | Default |
| --- | --- |
| `DUCKDB_PATH` | `data/zdnadatabase.duckdb` |
| `METADATA_GLOB` | `data/metadata.tsv.gz` |
| `DUCKDB_THREADS` | `6` |
| `DUCKDB_MEMORY_LIMIT_GB` | `4` |
| `DUCKDB_TEMP_DIR`, `DUCKDB_MAX_TEMP_GIB` | `data/tmp`, `50` |
| `HOST`, `PORT` | `0.0.0.0`, `8080` |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:3000` |
| `ADMIN_TOKEN` | unset (`/api/admin/init` disabled) |

```bash
cd backend && go test ./...
cd ../frontend && npm ci && npm test && npm run build
```

Use Node 22.12 or later for Vite 7. The source, schema documentation, exact input
metadata, checksums and final dataset must accompany the public archive. Public
links must identify published records and exact filenames; draft URLs are not
public download links.
