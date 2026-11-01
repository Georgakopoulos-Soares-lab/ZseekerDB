# ZSeekerDB

ZSeekerDB links sequence-based predictions of Z-forming potential to organismal
and viral genome assemblies. A Go API queries one DuckDB file; React provides
sequence search, assembly browsing, plots and downloads. RNA-virus records are
scored as cDNA sequences; these scores are not experimental validation of Z-RNA
formation.

[Open the portal](https://zseeker-db.com/) ·
[Build and export documentation](scripts/migrate/README.md) ·
[Reproduce the scientific figures](scripts/analysis/README.md)

## Verified catalog

The database built on 27 October 2026 contains:

| Metric | Value |
| --- | ---: |
| All genome assemblies | 324,200 |
| Assemblies with predictions | 148,217 |
| Assemblies without predictions | 175,983 |
| Species grouping identifiers | 60,841 |
| Predicted loci | 2,563,977,909 |
| Species-balanced mean genome size | 108,425,047 bp |
| Species-balanced mean G+C content | 47.7% |

Assembly attributes come from the supplied metadata; prediction counts,
predicted-base totals and densities were recomputed from the source CSVs.
Species grouping uses `ncbi_species_taxid` (stored as `species_taxid`), rather
than the assembly/strain `ncbi_taxid`. The complete metadata includes assemblies
with no predictions. The Species Browser lists prediction-bearing assemblies
with a reported genome size of at least 1,000 bp.

The final assembly-metadata TSV has SHA-256
`2a67abe869d6ae5a88843ae98ff0e3ac966322cc2a2091bf51d01926f9ed051e`.

## Dataset downloads and reconstruction

The build produces 23 checksummed bundles containing CSV, JSON, Parquet and
BED4 predictions, together with assembly metadata. Public dataset DOI and file
links are shown on the portal after publication and anonymous checksum
verification; private draft records are not public downloads. Individual query
results can be exported from Sequence search.

Full CSV, JSON and Parquet downloads each require **both parts**: part 1 contains
Archaea, Bacteria and Viruses; part 2 contains Eukaryota. Unpack the outer
container and then its inner superkingdom archives. BED4 uses half-open ends
and stores the assembly accession and unscaled ZSeeker score in its name field.
Other prediction formats retain native inclusive ends.

To rebuild the database from the Parquet downloads, unpack exactly one copy of
each shard and use the complete final metadata TSV:

```bash
python3 -m pip install -r scripts/migrate/requirements.txt
python3 scripts/migrate/import_release.py '/path/to/unpacked/**/*.parquet' /path/to/assembly_metadata.tsv /path/to/new.duckdb
```

The importer restores native human chromosome accessions, rebuilds derived
tables and runs the database verifier. It refuses to overwrite an existing
database. See the [build documentation](scripts/migrate/README.md) for the source
CSV pipeline, export commands and checksum manifest.

## Database design

`assembly` is the join key between predictions and assembly metadata. NCBI
accessions retain their version suffix (for example `GCF_009914755.1`). The source
TSV supplies assembly attributes. Its prediction summary fields can be stale;
the final build recomputes counts, predicted bases and density from `data`.

| Object | Purpose |
| --- | --- |
| `data` | One row per predicted locus, stored with native chromosome accession |
| `metadata_all` | One row per input assembly, including assemblies without predictions |
| `metadata` | Browser subset, by default `obs_n_zdna > 0`; legacy field layout |
| `chromosomes` | Distinct chromosome accessions from `data` |
| `tax_names` | Distinct `metadata.tax_name` values with genome size ≥1,000 bp |
| `data_kpis` | Prediction-wide aggregate statistics |
| `data_top_asm` | Prediction counts grouped by assembly |
| `data_top_chrom` | Prediction counts grouped by chromosome accession |
| `zdna` | Projection of `data`, exposing `assembly` as `Assembly` |
| `metadata_view` | Display-name projection of `metadata`, restricted to genome size ≥1,000 bp |

Views are ordinary SQL views, not materialized joins. The API uses `data` and
`metadata` directly for most searches. Homepage counts and balanced summaries
use `metadata_all`, with no minimum genome-size filter on counts. This avoids
excluding small viral genomes or assemblies with no predictions.

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

For `GCF_009914755.1` only, the portal and its result exports display
`NC_060925.1`–`NC_060948.1` as `1`–`22`, `X`, `Y`. Both chromosome labels and
accessions are accepted by assembly-scoped filters. Other assemblies and
unmapped contigs keep their source accessions. The underlying table remains in
source coordinates and source accession names.

### Assembly metadata

`metadata_all` contains the following fields. `metadata` has the same fields
except `species_taxid`, preserving the existing browser schema. Empty text
becomes SQL NULL; failed numeric conversions become NULL, not zero.

| Field | Type | TSV source / definition |
| --- | --- | --- |
| `assembly` | VARCHAR | `assembly`; unique accession, including assembly version |
| `bioproject` | VARCHAR | NULL when absent from the supplied TSV |
| `biosample` | VARCHAR | NULL when absent from the supplied TSV |
| `taxid` | BIGINT | `ncbi_summary_taxid` or `ncbi_taxid`; may identify a strain |
| `species_taxid` | BIGINT | `ncbi_summary_species_taxid` or `ncbi_species_taxid`; species grouping key |
| `assembly_level` | VARCHAR | `resolve_level`; complete → Complete Genome, chromosome → Chromosome |
| `genome_size` | BIGINT | `genome_size`, bp; not substituted with `genome_size_manual` |
| `gc_percent` | DOUBLE | `gc_percent`, percentage points (0–100) |
| `superkingdom` | VARCHAR | `superkingdom`; e.g. Eukaryota |
| `kingdom` | VARCHAR | `kingdom`; e.g. Metazoa |
| `phylum` | VARCHAR | `phylum`; e.g. Chordata |
| `class` | VARCHAR | `class`; e.g. Mammalia |
| `order` | VARCHAR | `order`; e.g. Primates |
| `family` | VARCHAR | `family`; e.g. Hominidae |
| `genus` | VARCHAR | `genus`; e.g. Homo |
| `tax_name` | VARCHAR | `tax_name`; source taxon label, e.g. Homo sapiens |
| `is_t2t` | BOOLEAN | Filename contains T2T; filename heuristic, not independent completeness validation |
| `viral_realm` | VARCHAR | `viral_realm`; supplied upstream |
| `updated_tax_name` | VARCHAR | `updated_tax_name`; supplied upstream |
| `obs_zbp` | BIGINT | Sum of actual locus sequence lengths, predicted bases (bp); source TSV field `Z-DNA/-RNA bases count` is replaced during the final build |
| `obs_density_per_kb` | DOUBLE | `obs_zbp * 1000 / genome_size`; predicted bp per 1,000 genome bp; NULL if genome size is unavailable or nonpositive |
| `obs_n_zdna` | BIGINT | Actual number of prediction rows; source TSV field `Z-DNA/-RNA predictions count` is replaced during the final build |

Additional source TSV attributes are retained in the archived TSV, not silently
promoted to queryable fields. Taxonomy normalization (including any Protists or
viral-realm assignment) is supplied upstream; this repository does not recreate
that mapping. All supplied taxon labels are retained.

### Auxiliary fields

| Object | Fields and types |
| --- | --- |
| `chromosomes` | `Chromosome VARCHAR` |
| `tax_names` | `tax_name VARCHAR` |
| `data_kpis` | `total_sites BIGINT`, `distinct_chr BIGINT`, `avg_score DOUBLE`, `min_score DOUBLE`, `max_score DOUBLE`, `avg_seq_len DOUBLE`, `distinct_asm BIGINT`, `computed_at TIMESTAMP WITH TIME ZONE` |
| `data_top_asm`, `data_top_chrom` | `k VARCHAR` (assembly or chromosome), `c BIGINT` (locus count) |

`metadata_view` exposes `assembly`, `bioproject`, `biosample`, `T2T`, `Genome size`,
`Taxon ID`, `GC content (%)`, all eight taxonomic name/rank fields,
`Viral realm`, `Infraspecific name`, `Z-DNA bps`, `Z-DNA density (per kb)`,
and `Number of predicrions` (legacy spelling). Types are inherited unchanged.

## Summary statistics

Homepage genome size and GC are calculated in two stages: average the available
assembly values within each positive, non-null `species_taxid`, then average
those species means. Missing values are omitted independently for each metric.
Kingdom density uses the same two-stage averaging within each kingdom,
including zero densities, and excludes names containing `unclassified` before
ranking the ten highest kingdoms. Species balancing reduces multiple-assembly
weighting; it is not a correction for phylogenetic dependence.

Superkingdom bars count all metadata rows and must sum to the assembly KPI.
The score histogram samples 200,000 predictions; the genome-size/GC scatter
samples up to 5,000 assemblies with positive genome size and available GC.
Chromosome “Predicted loci / 100 kb” plots count loci by the window containing
`Start` (`floor(Start/100000)`); they do not measure predicted base pairs.

## Data pipeline

Use **DuckDB 1.1.3**, matching **go-duckdb 1.8.5**, for database-file compatibility.
The application does not currently use the experimental two-bit sequence codec.

1. `scripts/migrate/audit.py`: compare source CSV assembly identifiers with the TSV.
2. `build_data.py`: ingest sorted per-assembly CSV files in byte-bounded atomic
   batches. `_ingest_state` records the committed file prefix for resume. The
   input directory and ordering must remain unchanged during a resumed build.
   Placeholder rows with missing chromosome, coordinates, score or sequence,
   invalid intervals or inconsistent sequence length are excluded.
3. `build_meta_stats.py`: build `metadata_all`, recompute observed locus counts,
   predicted bases and densities from `data`, then rebuild the browser `metadata` subset,
   auxiliary tables, aggregates and views. Existing nonempty objects are reused;
   set `MIG_FORCE=1` to rebuild derived objects. It does not rewrite `data`.
4. `verify.py`: check field types, join integrity, actual data counts and the
   SQL used by portal endpoints. A failed verification exits nonzero.

`release.py` provides a metadata-only rebuild, without copying billions of
prediction rows. It accepts both `ncbi_*` and `ncbi_summary_*` TSV taxid names,
validates unique assembly keys, and replaces both metadata tables atomically.
Set `MIG_RECOMPUTE_OBSERVED=1` when refreshing metadata against an existing
prediction table; this scans `data` to replace stale TSV prediction summaries.
The default `MIG_DROP_EMPTY_ASSEMBLIES=1` affects `metadata` only. `metadata_all`
always keeps the entire input TSV.

```bash
python3 -m pip install -r scripts/migrate/requirements.txt
export MIG_ROOT=/path/to/ZSeekerDB_migration
export MIG_DB_PATH="$MIG_ROOT/zdnadatabase.duckdb"
export MIG_META_TSV="$MIG_ROOT/zseeker_db_assembly_all_metadata.tsv"
export MIG_CSV_DIR="$MIG_ROOT/build/csv"
MIG_RECOMPUTE_OBSERVED=1 python3 scripts/migrate/release.py
python3 scripts/migrate/verify.py
python3 -m pytest scripts/migrate/tests/ -q
```

A source-archive inventory can be generated without extraction:
`python3 scripts/migrate/audit_archive.py all_zseeker_final.tar.gz inventory.csv`.
It counts records and small-file placeholders, not every row's validity.
Reconcile the inventory, input TSV and built DB before publishing totals or
rewriting manuscript statistics. Recomputing a prediction table does not
recompute scientific figures, correlations or supplementary analyses.

## Web interface and implementation

The checked-in manifests specify Gin **1.10.1**, go-duckdb **1.8.5**, Go **1.24**
(toolchain **1.24.5**), React **^19.1.1**, Material UI **^7.3.1**, ECharts **^5.6.0**,
echarts-for-react **^3.0.2**, Vite **^7.1.2**, and TypeScript **~5.8.3**.
`frontend/package-lock.json` pins the resolved JavaScript dependencies. These
are the code's versions; historical manuscript dependency numbers are not used
as a substitute for the manifests.

The frontend's Explorer builds analytical SELECT queries for the API. Assembly
search links use stable accessions; chromosome aliases are applied at the UI
and export boundaries. Server CSV exports stream rows; client CSV, TSV, JSON,
XML and Excel (HTML `.xls`) exports are capped at one million rows and fetched
in 50,000-row batches.

## API and SQL safeguards

- `GET /api/home/insights`: complete assembly KPIs, species-balanced means and
  four plot datasets; cached for 15 minutes.
- `GET /api/metadata/list`, `/distinct`, `/classes/top`, `/export`: browser metadata.
- `GET /api/zdna/search`, `/distinct_chr`, `/score_histogram`, `/export`: predictions.
- `GET /api/sql?query=...` or `POST /api/sql` with `{"sql":"SELECT ..."}`:
  the portal's restricted analytical SQL dialect.
- `GET /api/health`: health, including unavailable database status.

SQL requests accept a single SELECT or read-only WITH statement. Comments,
statement separators, dollar quoting, write/DDL/configuration commands (including
INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, COPY, EXPORT, INSTALL, LOAD,
PRAGMA), unapproved functions and direct non-portal FROM/JOIN sources are rejected.
The engine also disables external access and locks its configuration at startup.
The whitelist is deliberately narrower than general DuckDB SQL.

Limits: **32,768 SQL bytes**, **30 seconds**, **50,000 returned rows**, and
**120 SQL requests per minute per IP**. Results report `truncated` and `row_limit`.
Large downloads should use archived datasets. Trusted proxy headers are disabled;
if deploying behind a proxy, set `TRUSTED_PROXIES` to the exact comma-separated
proxy addresses or CIDRs before using forwarded IPs for per-user rate limiting. A shared proxy IP otherwise
shares the same rate limit.

## Deployment and local validation

The Docker image builds React and serves it from Go in one Railway service.
For a verified database with its views already built, set `DUCKDB_READ_ONLY=1`
to open the runtime file read-only. Mount a volume at `/data`, place the verified database at
`/data/zdnadatabase.duckdb`, and set `DUCKDB_PATH` accordingly. `PORT` is supplied
by Railway. Optional `CORS_ORIGIN` is a comma-separated origin list.

Without the database the service starts with degraded health and data routes
return 503; restart after installing the file. Runtime data files are excluded
from Git. The checked-in `data/metadata.tsv` is not automatically the final
migration input; pass `MIG_META_TSV` explicitly.

```bash
cd backend && go test ./...
cd ../frontend && npm ci && npm test && npm run build
```

Use Node 22.12 or later for Vite 7. The source, schema documentation, exact input
metadata, checksums and final dataset must accompany the public archive. Public
links must identify published records and exact filenames; draft URLs are not
public download links.
