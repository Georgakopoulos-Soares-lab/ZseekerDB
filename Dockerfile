# Build the React client.
FROM node:22-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# The existing frontend has legacy TypeScript diagnostics, while Vite can still
# produce the production bundle used at runtime.
RUN npx vite build

# Build the DuckDB-backed Go API. CGO is required by go-duckdb.
FROM golang:1.24-bookworm AS backend-build
WORKDIR /src/backend
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/zseeker-api .

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --home-dir /app zseeker
WORKDIR /app
COPY --from=backend-build /out/zseeker-api /app/zseeker-api
COPY --from=frontend-build /src/frontend/dist /app/frontend/dist

ENV GIN_MODE=release \
    PORT=8080 \
    DUCKDB_PATH=/data/zdnadatabase.duckdb \
    DUCKDB_TEMP_DIR=/tmp/duckdb
USER zseeker
EXPOSE 8080
CMD ["/app/zseeker-api"]
