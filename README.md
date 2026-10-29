# ZSeekerDB

ZSeekerDB is a single-container React and Go/DuckDB application. The Docker
image builds the frontend and serves it from the Go API, so it can be deployed
as one Railway service.


## Database architecture and implementation

### Database design and data pipelines

ZSeekerDB organizes Z-DNA/Z-RNA predictions and associated genomic metadata using DuckDB, an embedded analytical database management system. Prediction records are linked to their corresponding genome assemblies through stable assembly accession identifiers, enabling integrated queries across genomic sequences, assemblies, and taxonomic groups.

The metadata schema includes:

- **Taxonomic information:** superkingdom, kingdom, phylum, class, order, family, genus, species, and NCBI taxonomy identifiers.
- **Assembly characteristics:** genome size, G+C content, assembly-level information, and other assembly-associated attributes.
- **Z-DNA/Z-RNA information:** prediction records and associated summary statistics, including density metrics.

Predefined SQL views support common joins and facilitate sequence-, assembly-, and species-level queries. The application uses a DuckDB database file as its primary analytical data source, together with the supplementary metadata file described in the deployment documentation below.

The database is designed to support interactive exploration of genomic predictions and metadata, while versioned dataset archives provide access for larger-scale computational analyses.

### Backend architecture and data access

The backend is implemented in Go using the Gin Web Framework (v1.10). DuckDB is integrated through the `go-duckdb` driver to provide in-process analytical querying of genomic datasets.

The backend exposes REST API endpoints supporting:

- Retrieval and filtering of genomic and taxonomic metadata.
- Assembly-specific Z-DNA/Z-RNA prediction searches.
- Computation and retrieval of summary statistics and visualizations.
- Export of selected datasets in supported formats.
- Execution of validated, read-only SQL queries.

The application accesses its analytical data through DuckDB and uses predefined SQL views to support common database operations.

#### SQL query restrictions and safeguards

The public SQL API (`GET|POST /api/sql`) is restricted to a single validated, read-only query per request. Queries are checked using DuckDB's SQL parser.

The endpoint rejects write operations, data-definition commands, and multiple SQL statements. Prohibited operations include:

- Data modification: `INSERT`, `UPDATE`, `DELETE`.
- Schema modification: `CREATE`, `DROP`, `ALTER`.
- File and database access: `ATTACH`, `COPY`, `EXPORT`.
- Extension management: `INSTALL`, `LOAD`.
- Configuration operations: `PRAGMA`.

The backend also restricts database file and network access during query execution. This limits the ability of user-submitted SQL to access server-side resources or modify database configuration.

Application-level safeguards include restrictions on query length, execution time, returned row counts, and request frequency. Queries exceeding the configured result limits are truncated or rejected according to the applicable endpoint restrictions.

Users requiring complete datasets or large-scale analyses are directed to the versioned downloadable dataset archives rather than the interactive query interface.

For the endpoint definitions and configuration details, see [API endpoints](#api-endpoints).

### Frontend and web-interface implementation

The frontend is implemented in React (v19.1.0) using TypeScript (v5.8.3), providing a web-based environment for genomic data exploration.

The interface integrates database-backed queries with interactive tables and graphical visualizations, allowing users to explore Z-DNA/Z-RNA predictions and associated genomic metadata across assemblies and taxonomic groups.

The principal frontend technologies are:

| Component | Technology | Version | Purpose |
|---|---|---|---|
| Frontend framework | React | 19.1.0 | Component-based web interface |
| UI component library | Material UI | 7.1.0 | Interface components and layout |
| Visualization library | Apache ECharts | 5.6.0 | Interactive genomic data visualizations |
| React visualization integration | ECharts-for-React | 3.0.2 | Integration of ECharts with React |
| Build system | Vite | 6.3.5 | Frontend compilation and production builds |
| Programming language | TypeScript | 5.8.3 | Statically typed frontend development |
| Backend framework | Gin Web Framework | 1.10 | REST API implementation |
| Analytical database | DuckDB | Release-compatible version | Embedded analytical query processing |
| Database driver | go-duckdb | See dependency manifest | Go integration with DuckDB |

Vite is distributed under the MIT License, and TypeScript under the Apache License 2.0 License.

The frontend is compiled during the Docker image build process and served by the Go backend, enabling deployment as a single application container.

### Data visualization and export

The web interface supports interactive exploration of taxonomic and genomic metadata, including assembly-level searches, filtered metadata tables, summary statistics, and graphical visualizations.

Apache ECharts is used to render interactive plots, while the backend provides API endpoints for retrieving the corresponding analytical data.

Metadata exports support CSV, TSV, JSON, XML, and XLS formats. Export functionality is implemented through dedicated API endpoints, allowing users to retrieve selected data for downstream processing.

For computational analyses requiring complete prediction datasets beyond the limits of interactive queries, users should use the downloadable release archives.

### Deployment and reproducibility

ZSeekerDB is distributed as a containerized React and Go application with DuckDB as its analytical database engine.

The Docker image builds the frontend and serves the resulting application through the Go backend. The deployment requires a compatible DuckDB release database and the associated metadata resource.

Deployment configuration, database migration procedures, environment variables, API endpoints, and release-switching instructions are documented in the sections below.

For reproducibility, the exact dependency versions and compatible database format should be determined from the repository's dependency manifests, lockfiles, and release-specific deployment configuration.

## Railway deployment

1. In Railway, create a **GitHub Repo** service from this repository and select
   the branch containing this Dockerfile. Railway detects the root `Dockerfile`
   automatically.
2. Add a Railway volume mounted at `/data` and upload/copy
   `zdnadatabase.duckdb` to `/data/zdnadatabase.duckdb`.
3. Set `DUCKDB_PATH=/data/zdnadatabase.duckdb` (this is also the container
   default). Railway provides `PORT` automatically; do not override it unless
   needed.
4. Optionally set `CORS_ORIGIN` if the frontend will be hosted separately. It
   is not needed when using the bundled frontend.

### Switching to a new data release

Release databases are built with `scripts/migrate/` (see its README) and must be written
with DuckDB 1.1.x to stay readable by `go-duckdb v1.8.5`.

1. Upload the new file next to the current one, e.g. `/data/zdnadatabase_2026-10.duckdb`.
2. Set `DUCKDB_PATH` to the new file and redeploy; check `/api/health` and the pages.
3. To roll back, point `DUCKDB_PATH` at the previous file and redeploy. Delete the old
   file only after the release is signed off.

The deployment health check is `/api/health`. The service intentionally starts
without a DuckDB file so Railway can deploy before the volume is populated. In
that state health returns HTTP 200 with `"status":"degraded"`, and data API
routes return HTTP 503 with the configured database path. Once the file is
present, restart/redeploy the service and it will open the database.

The DuckDB database is the only required runtime dataset excluded from Git.
`data/metadata.tsv.gz`, `imported_metadata.csv`, and `import_log.txt` are already
tracked in the repository. `data/metadata.tsv.gz` (gzip, because the plain TSV exceeds GitHub's 100 MB file limit;
DuckDB reads it directly) is the authoritative metadata:
it lists all release assemblies, including those with no predictions, whereas
the DuckDB `metadata` table only holds assemblies with predictions. At startup
the backend attaches the DuckDB file **read-only**, exposes its tables under
their usual names, and loads the TSV into an in-memory `metadata` table (same
column mapping as `scripts/migrate/release.py`, without `is_t2t`/`has_gff`,
which are intentionally not part of the metadata, and with `genome_size_manual`
as the only genome size; the TSV's raw `genome_size` is not loaded). The Docker image copies the
TSV to `/app/data/metadata.tsv.gz`; override the path with `METADATA_GLOB`. If the TSV cannot be loaded, the service starts
degraded like a missing database file.

## API endpoints

Used by the React UI:
- `GET /api/home/insights` → homepage KPIs and charts (computed once at startup)
- `GET /api/metadata/list`, `/api/metadata/export`, `/api/metadata/charts`, `/api/metadata/distinct` →
  Species browser table, downloads (csv/tsv/json/xml/xls), charts and filter options; all take the same
  taxonomy/range filter parameters
- `GET|POST /api/sql` → executes a single validated, read-only
  SELECT query. DuckDB's SQL parser rejects prohibited operations
  and multiple statements. Database file/network access is disabled
  after initialization, and the configuration is locked.

Other routes:
- `GET /api/health`
- `GET /api/zdna/search`, `/api/zdna/export`, `/api/zdna/score_histogram` → raw predictions for one
  assembly; `assembly_eq=<accession>` is required (without it a request would scan all ~2.5 billion rows)
- `GET /api/zdna/distinct_chr`, `/api/metadata/classes/top`, `/api/metadata/preview`, `/api/zdna/preview`
- `POST /api/admin/init` → recreates views; disabled unless `ADMIN_TOKEN` is set, and then requires the
  same value in the `X-Admin-Token` header

Local default paths (change in `.env`):
```
DUCKDB_PATH          = data/zdnadatabase.duckdb
METADATA_GLOB        = data/metadata.tsv.gz
DUCKDB_THREADS       = 6
HOST                 = 0.0.0.0
PORT                 = 8080
CORS_ORIGIN          = http://localhost:5173,http://localhost:3000
ADMIN_TOKEN          = (unset: /api/admin/init disabled)
```
