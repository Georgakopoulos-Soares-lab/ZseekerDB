type SqlResponse = {
  data?: unknown[];
  rows?: unknown[];
  columns?: string[];
  error?: string;
};

/**
 * Runs one SELECT through the backend's /api/sql endpoint and returns its rows as objects.
 * The query is collapsed to a single line before sending, so it must not contain `--`
 * comments, and the backend accepts exactly one SELECT statement.
 */
export async function runSQL<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const url = `/api/sql?query=${encodeURIComponent(normalized)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const text = await r.text();
  let j: SqlResponse | unknown[] | null = null;
  try { j = JSON.parse(text); } catch { /* non-JSON error body */ }
  const body = (j && !Array.isArray(j) ? j : {}) as SqlResponse;
  if (!r.ok) throw new Error(body.error ? String(body.error) : `SQL HTTP ${r.status}`);
  if (Array.isArray(body.data)) return body.data as T[];
  if (Array.isArray(body.rows) && Array.isArray(body.columns)) {
    const cols = body.columns;
    return body.rows.map(row =>
      Array.isArray(row) ? Object.fromEntries(cols.map((c, i) => [c, row[i]])) : row
    ) as T[];
  }
  if (Array.isArray(body.rows)) return body.rows as T[];
  return Array.isArray(j) ? (j as T[]) : [];
}
