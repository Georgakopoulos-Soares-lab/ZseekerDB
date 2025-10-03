// src/pages/HomeInsights.tsx
import { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Paper, Typography, CircularProgress } from '@mui/material';
import ReactECharts from 'echarts-for-react';
import { minWidth } from '@mui/system';

/** call /api/sql with a normalized SELECT */
async function fetchSql<T = any>(sql: string): Promise<T[]> {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const url = `/api/sql?query=${encodeURIComponent(normalized)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const text = await res.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(json?.error || `SQL HTTP ${res.status}`);
  return (Array.isArray(json?.data) ? json.data : []) as T[];
}

const fmtInt = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';
const fmtBig = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';

type KV = { label: string; n: number };

export default function HomeInsights() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // KPIs
  const [totalAssemblies, setTotalAssemblies] = useState<number | null>(null);
  const [uniqueTaxids,    setUniqueTaxids]    = useState<number | null>(null);
  const [avgGenome,       setAvgGenome]       = useState<number | null>(null);
  const [avgGC,           setAvgGC]           = useState<number | null>(null);

  // Charts
  const [sk,  setSK]   = useState<KV[]>([]);
  const [topK, setTopK] = useState<KV[]>([]);
  const [hist, setHist] = useState<{ bin: number; n: number }[]>([]);
  const [scatter, setScatter] = useState<{ gs: number; gc: number; sk: string }[]>([]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setLoading(true); setError(null);

        // KPIs
        const [ov] = await fetchSql<any>(`
          SELECT
            COUNT(*) AS total_assemblies,
            COUNT(DISTINCT taxid) AS unique_taxids,
            AVG(TRY_CAST(genome_size AS DOUBLE)) AS avg_genome_size,
            AVG(TRY_CAST(gc_percent  AS DOUBLE)) AS avg_gc
          FROM metadata
        `);

        // Donut: superkingdoms
        const skRows = await fetchSql<KV>(`
          SELECT COALESCE(superkingdom,'(unknown)') AS label, COUNT(*) AS n
          FROM metadata
          GROUP BY 1
          ORDER BY n DESC
        `);

        // Bar: top 10 kingdoms
        const topKRows = await fetchSql<KV>(`
          SELECT kingdom AS label, COUNT(*) AS n
          FROM metadata
          WHERE kingdom IS NOT NULL AND kingdom <> ''
          GROUP BY 1
          ORDER BY n DESC
          LIMIT 10
        `);

        // Histogram: Z‑DNA score (SELECT με υποερώτημα — ΟΧΙ WITH)
        const histRows = await fetchSql<{ bin: number; n: number }>(`
          SELECT FLOOR(score/10)*10 AS bin, COUNT(*) AS n
          FROM (
            SELECT "Z-DNA Score" AS score
            FROM data USING SAMPLE 200000 ROWS
          ) f
          GROUP BY 1
          ORDER BY 1
        `);

        // Scatter: genome size vs GC% (sampled)
        const scRows = await fetchSql<{ gs: number; gc: number; superkingdom: string }>(`
          SELECT
            TRY_CAST(genome_size AS DOUBLE) AS gs,
            TRY_CAST(gc_percent  AS DOUBLE) AS gc,
            superkingdom
          FROM metadata
          WHERE genome_size IS NOT NULL AND gc_percent IS NOT NULL
          USING SAMPLE 20000 ROWS
        `);

        if (dead) return;
        setTotalAssemblies(Number(ov?.total_assemblies ?? null));
        setUniqueTaxids(Number(ov?.unique_taxids ?? null));
        setAvgGenome(Number(ov?.avg_genome_size ?? null));
        setAvgGC(Number(ov?.avg_gc ?? null));

        setSK(skRows);
        setTopK(topKRows);
        setHist(histRows.map(r => ({ bin: Number(r.bin), n: Number(r.n) })));
        setScatter(scRows.map(r => ({ gs: Number(r.gs), gc: Number(r.gc), sk: String(r.superkingdom || '') })));
      } catch (e: any) {
        if (!dead) setError(e?.message || 'Failed to load home insights');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  // ECharts options
  const pieOpt = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}<br/>${p.value.toLocaleString()} (${p.percent}%)` },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie',
      radius: ['50%','70%'],
      label: { show: false },
      data: sk.map(d => ({ name: d.label, value: d.n }))
    }]
  }), [sk]);

  const topKOpt = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 20, top: 20, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', inverse: true, data: topK.map(d => d.label) },
    series: [{ type: 'bar', data: topK.map(d => d.n) }]
  }), [topK]);

  const histOpt = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    grid: { 
      left: 80,
      right: 20,
      top: 30,
      bottom: 80,
      containLabel: true
    },
    xAxis: { 
      type: 'category', 
      name: 'Score bin',
      nameLocation: 'middle', // Added to match scatter plot
      nameGap: 50,           // Added to match scatter plot
      data: hist.map(d => d.bin),
      axisLabel: {
        margin: 14,
        rotate: 45
      }
    },
    yAxis: { 
      type: 'value', 
      name: 'Count',
      nameLocation: 'middle',
      nameGap: 50
    },
    series: [{ 
      type: 'bar', 
      data: hist.map(d => d.n) 
    }]
  }), [hist]);

  const scatterOpt = useMemo(() => {
    const bySK = new Map<string, [number,number][]>();
    scatter.forEach(p => {
      const arr = bySK.get(p.sk || '(unknown)') || [];
      arr.push([p.gs, p.gc]);
      bySK.set(p.sk || '(unknown)', arr);
    });
    return {
      tooltip: { trigger: 'item', formatter: (p: any) => `Genome size: ${p.value[0].toLocaleString()}<br/>GC%: ${p.value[1].toFixed(2)}` },
      grid: { 
        left: 80,    
        right: 20,
        top: 30,
        bottom: 110,  // Αυξήθηκε από 80 σε 100 για περισσότερο χώρο
        containLabel: true
      },
      xAxis: { 
        type: 'value', 
        name: 'Genome size',
        nameLocation: 'middle',
        nameGap: 80,  // Αυξήθηκε από 50 σε 70
        axisLabel: { 
          formatter: (v: number) => v.toLocaleString(),
          margin: 20,  // Αυξήθηκε από 14 σε 20
          rotate: 45,
          align: 'right' // Προσθήκη για καλύτερη ευθυγράμμιση
        }
      },
      yAxis: { 
        type: 'value', 
        name: 'GC%',
        nameLocation: 'middle',
        nameGap: 50   // Προσθήκη gap
      },
      legend: { bottom: 0 },
      series: Array.from(bySK.entries()).map(([name, pts]) => ({
        name, type: 'scatter', symbolSize: 6, data: pts
      }))
    };
  }, [scatter]);

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 700 }}>Quick dataset insights</Typography>

      {loading ? (
        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Paper sx={{ p: 2 }}><Typography color="error">{error}</Typography></Paper>
      ) : (
        <>
          {/* KPIs */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '24%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Total assemblies</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtInt(totalAssemblies)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '23%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Unique taxids</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtInt(uniqueTaxids)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '24%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Avg genome size</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtBig(avgGenome)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '23%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Avg GC%</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtBig(avgGC)}</Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Charts: 2 ανά σειρά */}
          <Grid container spacing={2} sx={{ width: '100%' }}>
            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Superkingdom distribution</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={pieOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Top 10 kingdoms</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={topKOpt} />
                </Box>
              </Paper>
            </Grid>
          </Grid>
          <br></br>

          <Grid container spacing={2} sx={{ width: '100%', mt: 0 }}>
            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, marginBottom: '12px' }}>Z-DNA score — histogram (sampled)</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={histOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Genome size vs GC% (sampled)</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={scatterOpt} />
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
