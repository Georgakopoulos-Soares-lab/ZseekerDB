# ZDNA Backend — Full (v2) with Frontend Compatibility Endpoints

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

Default paths (change in `.env`):
```
DUCKDB_PATH          = D:/zdna/data/zdnadatabase.duckdb
METADATA_GLOB        = C:/zdna/data/metadata.tsv
DUCKDB_THREADS       = 6
HOST                 = 0.0.0.0
PORT                 = 8080
CORS_ORIGIN          = http://localhost:5173,http://localhost:3000
```