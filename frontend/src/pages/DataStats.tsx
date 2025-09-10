// frontend/src/pages/DataStats.tsx
import { useEffect, useState } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress,
  List, ListItem, ListItemText
} from '@mui/material';

// ---- helpers ---------------------------------------------------------------

type KPI = {
  total_sites: number;
  distinct_chr: number;
  avg_score: number;
  min_score: number;
  max_score: number;
  avg_seq_len: number;
  distinct_asm: number;
  computed_at?: string;
};

type TopItem = { k: string; c: number };

async function runSQL<T = any>(sql: string): Promise<T[]> {
  const url = `/api/sql?query=${encodeURIComponent(sql)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();

  // backend variants: {columns, rows} ή {data} ή array
  if (Array.isArray(j)) return j as T[];
  if (Array.isArray(j?.data)) return j.data as T[];
  if (Array.isArray(j?.rows) && Array.isArray(j?.columns)) {
    const cols: string[] = j.columns;
    return (j.rows as any[]).map(row =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    ) as T[];
  }
  return [];
}

const fmtInt = (v?: number) =>
  typeof v === 'number' ? v.toLocaleString() : '—';
const fmtNum = (v?: number, d = 2) =>
  typeof v === 'number' ? v.toFixed(d) : '—';

// ---- small presentational bits --------------------------------------------

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper elevation={1} sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{title}</Typography>
      <Typography variant="h5" sx={{ mt: .5 }}>{children}</Typography>
    </Paper>
  );
}

function TopListCard({ title, items }: { title: string; items: TopItem[] }) {
  return (
    <Paper elevation={1} sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>
      <List dense disablePadding>
        {items.map((it, i) => (
          <ListItem key={i} disableGutters
            secondaryAction={<Typography variant="body2">{fmtInt(it.c)}</Typography>}>
            <ListItemText
              primaryTypographyProps={{ variant: 'body2' }}
              primary={it.k}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}

// ---- page ------------------------------------------------------------------

export default function DataStats() {
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [topChrom, setTopChrom] = useState<TopItem[]>([]);
  const [topAsm, setTopAsm] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [k, tc, ta] = await Promise.all([
          runSQL<KPI>('SELECT * FROM data_kpis'),
          runSQL<TopItem>('SELECT k, c FROM data_top_chrom ORDER BY c DESC LIMIT 10'),
          runSQL<TopItem>('SELECT k, c FROM data_top_asm   ORDER BY c DESC LIMIT 10'),
        ]);
        if (!dead) {
          setKpi(k?.[0] ?? null);
          setTopChrom(tc ?? []);
          setTopAsm(ta ?? []);
        }
      } catch (e: any) {
        if (!dead) setErr(e?.message || 'Failed to load statistics');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (err) {
    return (
      <Box sx={{ p: 3 }}>
        <Paper sx={{ p: 2, borderLeft: t => `4px solid ${t.palette.error.main}` }}>
          <Typography variant="subtitle2" color="error">Error</Typography>
          <Typography variant="body2">SQL: {err}</Typography>
        </Paper>
      </Box>
    );
  }

  if (!kpi) return null;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Data — Statistics</Typography>

      {/* KPIs */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4} lg={2}><StatCard title="Total Z‑DNA sites">{fmtInt(kpi.total_sites)}</StatCard></Grid>
        <Grid item xs={12} md={4} lg={2}><StatCard title="Distinct Chromosomes">{fmtInt(kpi.distinct_chr)}</StatCard></Grid>
        <Grid item xs={12} md={4} lg={2}><StatCard title="Avg Z‑DNA Score">{fmtNum(kpi.avg_score, 2)}</StatCard></Grid>
        <Grid item xs={12} md={4} lg={2}><StatCard title="Min Z‑DNA Score">{fmtNum(kpi.min_score, 2)}</StatCard></Grid>
        <Grid item xs={12} md={4} lg={2}><StatCard title="Max Z‑DNA Score">{fmtNum(kpi.max_score, 2)}</StatCard></Grid>
        <Grid item xs={12} md={4} lg={2}><StatCard title="Avg Sequence Length">{fmtNum(kpi.avg_seq_len, 2)}</StatCard></Grid>
      </Grid>

      <Box sx={{ mt: 2 }} />

      {/* Distinct assemblies as extra KPI */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={4} lg={2}>
          <StatCard title="Distinct Assemblies">{fmtInt(kpi.distinct_asm)}</StatCard>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3 }} />

      {/* Top lists */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}><TopListCard title="Top 10 Chromosomes" items={topChrom} /></Grid>
        <Grid item xs={12} md={6}><TopListCard title="Top 10 Assemblies"  items={topAsm} /></Grid>
      </Grid>
    </Box>
  );
}
