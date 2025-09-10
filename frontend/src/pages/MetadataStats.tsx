import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Grid,
} from '@mui/material';

// -----------------------------------------------------
// helpers
// -----------------------------------------------------

async function fetchSql<T = any>(sql: string): Promise<T[]> {
  // 1) Κανονικοποίηση: μονή γραμμή, χωρίς leading/trailing κενά
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const url = `/api/sql?query=${encodeURIComponent(normalized)}`;

  // 2) Ζήτα JSON και απόφυγε cache
  const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });

  // 3) Διάβασε μία φορά το σώμα και δοκίμασε να το κάνεις JSON
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* ignore */ }

  if (!r.ok) {
    const msg = (j && j.error) ? String(j.error) : `SQL HTTP ${r.status}`;
    throw new Error(msg);
  }

  const rows = (Array.isArray(j?.rows) ? j.rows
             : Array.isArray(j?.data) ? j.data
             : []) as T[];
  return rows;
}

const fmtInt = (n: number | null | undefined) =>
  (typeof n === 'number' && Number.isFinite(n)) ? n.toLocaleString() : '—';

const fmtPercent = (n: number | null | undefined, digits = 2) =>
  (typeof n === 'number' && Number.isFinite(n)) ? `${n.toFixed(digits)}%` : '—';

const fmtBig = (n: number | null | undefined) =>
  (typeof n === 'number' && Number.isFinite(n)) ? n.toLocaleString() : '—';

type KV = { label: string; n: number };

// Μικρό card component για KPIs
function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Paper elevation={1} sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{title}</Typography>
      <Typography variant="h6" sx={{ mt: .5 }}>{value}</Typography>
    </Paper>
  );
}

// Card λίστας (π.χ. Top 5 Kingdoms / Genus)
function TopListCard({ title, items }: { title: string; items: KV[] }) {
  return (
    <Paper elevation={1} sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{title}</Typography>
      <Box sx={{ mt: 1, display: 'grid', rowGap: 1 }}>
        {items.map((it, i) => (
          <Box key={`${it.label}-${i}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" noWrap sx={{ pr: 2 }}>{it.label || '(unknown)'}</Typography>
            <Typography variant="body2" color="text.secondary">{fmtInt(it.n)}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

// -----------------------------------------------------
// page
// -----------------------------------------------------

export default function MetadataStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview KPIs
  const [totalAssemblies, setTotalAssemblies] = useState<number | null>(null);
  const [uniqueTaxids, setUniqueTaxids] = useState<number | null>(null);
  const [avgGenome, setAvgGenome] = useState<number | null>(null);
  const [minGenome, setMinGenome] = useState<number | null>(null);
  const [maxGenome, setMaxGenome] = useState<number | null>(null);
  const [avgGC, setAvgGC] = useState<number | null>(null);
  const [minGC, setMinGC] = useState<number | null>(null);
  const [maxGC, setMaxGC] = useState<number | null>(null);

  // groups
  const [superkingdoms, setSuperkingdoms] = useState<KV[]>([]);
  const [topKingdoms, setTopKingdoms] = useState<KV[]>([]);
  const [topGenus, setTopGenus] = useState<KV[]>([]);
  const [assemblyLevels, setAssemblyLevels] = useState<KV[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Overview — με try_cast για ασφάλεια σε αναγνώσεις από TSV
        const overviewSql = `
          SELECT
            COUNT(*)                                AS total_assemblies,
            COUNT(DISTINCT taxid)                   AS unique_taxids,
            AVG(try_cast(genome_size AS DOUBLE))    AS avg_genome_size,
            MIN(try_cast(genome_size AS DOUBLE))    AS min_genome_size,
            MAX(try_cast(genome_size AS DOUBLE))    AS max_genome_size,
            AVG(try_cast(gc_percent  AS DOUBLE))    AS avg_gc,
            MIN(try_cast(gc_percent  AS DOUBLE))    AS min_gc,
            MAX(try_cast(gc_percent  AS DOUBLE))    AS max_gc
          FROM metadata
        `;
        const [ov] = await fetchSql<any>(overviewSql);

        // 2) Superkingdoms
        const superSql = `
          SELECT coalesce(superkingdom,'(unknown)') AS label, COUNT(*) AS n
          FROM metadata
          GROUP BY 1
          ORDER BY n DESC
        `;
        const sup = await fetchSql<KV>(superSql);

        // 3) Top 5 Kingdoms
        const topKSql = `
          SELECT kingdom AS label, COUNT(*) AS n
          FROM metadata
          WHERE kingdom IS NOT NULL AND kingdom <> ''
          GROUP BY 1
          ORDER BY n DESC
          LIMIT 5
        `;
        const tK = await fetchSql<KV>(topKSql);

        // 4) Top 5 Genus
        const topGSql = `
          SELECT genus AS label, COUNT(*) AS n
          FROM metadata
          WHERE genus IS NOT NULL AND genus <> ''
          GROUP BY 1
          ORDER BY n DESC
          LIMIT 5
        `;
        const tG = await fetchSql<KV>(topGSql);

        // 5) Assembly levels
        const asmSql = `
          SELECT coalesce(assembly_level,'(unknown)') AS label, COUNT(*) AS n
          FROM metadata
          GROUP BY 1
          ORDER BY n DESC
        `;
        const asm = await fetchSql<KV>(asmSql);

        if (cancelled) return;

        setTotalAssemblies(Number(ov?.total_assemblies ?? null));
        setUniqueTaxids(Number(ov?.unique_taxids ?? null));
        setAvgGenome(Number(ov?.avg_genome_size ?? null));
        setMinGenome(Number(ov?.min_genome_size ?? null));
        setMaxGenome(Number(ov?.max_genome_size ?? null));
        setAvgGC(Number(ov?.avg_gc ?? null));
        setMinGC(Number(ov?.min_gc ?? null));
        setMaxGC(Number(ov?.max_gc ?? null));

        setSuperkingdoms(sup);
        setTopKingdoms(tK);
        setTopGenus(tG);
        setAssemblyLevels(asm);
      } catch (e: any) {
        setError(e?.message || 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const hasData = useMemo(() => !loading && !error, [loading, error]);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Metadata — Statistics</Typography>

      {loading && (
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Paper sx={{ p: 2 }}>
          <Typography color="error">Error: {error}</Typography>
        </Paper>
      )}

      {hasData && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {/* KPIs */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Total Assemblies" value={fmtInt(totalAssemblies)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Unique TaxIDs" value={fmtInt(uniqueTaxids)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Avg Genome Size" value={fmtBig(avgGenome)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Min Genome Size" value={fmtBig(minGenome)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Max Genome Size" value={fmtBig(maxGenome)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Avg GC%" value={fmtPercent(avgGC, 2)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Min GC%" value={fmtPercent(minGC, 2)} /></Grid>
            <Grid item xs={12} md={4} lg={2}><StatCard title="Max GC%" value={fmtPercent(maxGC, 2)} /></Grid>
          </Grid>

          {/* Superkingdoms */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Superkingdoms</Typography>
            <Grid container spacing={2}>
              {superkingdoms.map((sk) => (
                <Grid key={sk.label || '(unknown)'} item xs={12} md={6} lg={3}>
                  <StatCard title={sk.label || '(unknown)'} value={fmtInt(sk.n)} />
                </Grid>
              ))}
            </Grid>
          </Box>

          {/* Top lists */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TopListCard title="Top 5 Kingdoms" items={topKingdoms} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TopListCard title="Top 5 Genus" items={topGenus} />
            </Grid>
          </Grid>

          {/* Assembly levels */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Assembly Levels</Typography>
            <Grid container spacing={2}>
              {assemblyLevels.map((a) => (
                <Grid key={a.label || '(unknown)'} item xs={12} md={6} lg={3}>
                  <StatCard title={a.label || '(unknown)'} value={fmtInt(a.n)} />
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      )}
    </Box>
  );
}
