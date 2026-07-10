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

The deployment health check is `/api/health`. The service intentionally starts
without a DuckDB file so Railway can deploy before the volume is populated. In
that state health returns HTTP 200 with `"status":"degraded"`, and data API
routes return HTTP 503 with the configured database path. Once the file is
present, restart/redeploy the service and it will open the database.

The DuckDB database is the only required runtime dataset excluded from Git.
`data/metadata.tsv`, `imported_metadata.csv`, and `import_log.txt` are already
tracked in the repository, although the application serves data from DuckDB.

## API endpoints

This version adds routes expected by your current React UI:
- `GET /api/zdna/search` → returns rows from `zdna` (Chromosome/Start/End/Z-DNA Score/Sequence)
- `GET /api/metadata/list` and `/api/metadata/list2` → returns rows from `metadata`
- `GET /api/metadata/classes/top` → returns top frequent values for a categorical column (prefers `organism` if present)

Existing routes remain:
- `GET /api/health`
- `POST /api/admin/init`
- `GET /api/metadata`, `GET /api/zdna` (generic with filters)
- `GET /api/columns/:table`
- `POST /api/sql` (SELECT/EXPLAIN/DESCRIBE only)

Local default paths (change in `.env`):
```
DUCKDB_PATH          = data/zdnadatabase.duckdb
METADATA_GLOB        = data/metadata.tsv
DUCKDB_THREADS       = 6
HOST                 = 0.0.0.0
PORT                 = 8080
CORS_ORIGIN          = http://localhost:5173,http://localhost:3000
```
