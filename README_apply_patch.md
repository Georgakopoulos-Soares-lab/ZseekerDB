# ZDNA Backend Patch (C: metadata.tsv + D: zdna.parquet) — v4

This patch fixes the DuckDB `read_csv` options for your version (uses `nullstr` instead of `nullstrs`).

**Defaults (adjust in .env if needed):**
- `METADATA_GLOB = C:/zdna/data/metadata.tsv`

## Files
```
backend/
  ├─ .env.example
  └─ main.go
scripts/
  ├─ duckdb_init.sql
  └─ materialize_metadata.sql
README_apply_patch.md
```

## Apply
1) Copy `backend/main.go` over your `C:\zdna\backend\main.go`.
2) Create `C:\zdna\backend\.env` based on `.env.example`.
3) PowerShell:
   ```powershell
   cd C:\zdna\backend
   # If your folder has no go.mod yet, do:  go mod init zdna-backend
   go mod tidy
   go run .
   ```
4) Check:
   - http://localhost:8080/api/health
   - http://localhost:8080/api/metadata/preview
   - http://localhost:8080/api/zdna/preview

If views ever need refreshing without restart, call `POST /api/admin/init`.