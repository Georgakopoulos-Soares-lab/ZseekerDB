# ZSeekerDB

ZSeekerDB is a single-container React and Go/DuckDB application. The Docker
image builds the frontend and serves it from the Go API, so it can be deployed
as one Railway service.

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
- `GET|POST /api/sql` → runs **one SELECT statement** (validated with DuckDB's parser; anything else,
  including several statements, is rejected). After startup the engine's file/network access is switched
  off and the configuration locked, so queries cannot read server files or undo this.

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
