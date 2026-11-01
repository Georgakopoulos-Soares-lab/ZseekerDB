// src/pages/HomeInsights.tsx
import { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Paper, Typography, CircularProgress } from '@mui/material';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '@mui/material/styles';
import { shortenKingdom } from '../utils/kingdoms';
import { skColor } from '../utils/superkingdomColors';
import { VIZ_FONT, VIZ_MUI_FONT } from '../utils/visualizationTypography';
import type { ChartParam } from '../utils/chartTypes';

const fmtNum = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
    : '—';

const fmtInt = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
    : '—';

type KV = { label: string; n: number; superkingdom?: string };
type InsightsResponse = {
  kpis: { total_assemblies: number; total_predictions: number; unique_taxids: number; avg_genome_size: number | null; avg_gc: number | null };
  superkingdoms: { label: string; n: number }[];
  top_kingdoms: { label: string; density: number; superkingdom: string; assembly_count: number }[];
  histogram: { bin: number; n: number }[];
  scatter: { gs: number; gc: number; sk: string }[];
};

export default function HomeInsights({ onCounts }: { onCounts?: (assemblies: number, predictions: number) => void }) {
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

  const theme = useTheme();
  const axisLabelColor = theme.palette.mode === 'dark' ? '#ffffff' : '#666666';
  const axisNameColor = theme.palette.mode === 'dark' ? '#ffffff' : '#333333';

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setLoading(true); setError(null);

        // Single request — backend runs queries in parallel and caches for this process.
        const res = await fetch('/api/home/insights', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json() as InsightsResponse;

        if (dead) return;
        setTotalAssemblies(d.kpis.total_assemblies);
        onCounts?.(d.kpis.total_assemblies, d.kpis.total_predictions);
        setUniqueTaxids(d.kpis.unique_taxids);
        setAvgGenome(d.kpis.avg_genome_size);
        setAvgGC(d.kpis.avg_gc);

        setSK((d.superkingdoms ?? []).map((r) => ({ label: String(r.label), n: Number(r.n) })));
        setTopK((d.top_kingdoms ?? []).map((r) => ({
          label: String(r.label),
          n: Number(r.density ?? 0),
          superkingdom: String(r.superkingdom ?? '(unknown)'),
          cnt: Number(r.assembly_count ?? 0),
        })));
        setHist((d.histogram ?? []).map((r) => ({ bin: Number(r.bin), n: Number(r.n) })));
        setScatter((d.scatter ?? []).map((r) => ({ gs: Number(r.gs), gc: Number(r.gc), sk: String(r.sk || '') })));
      } catch (e: unknown) {
        if (!dead) setError(e instanceof Error ? e.message : 'Failed to load home insights');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [onCounts]);

const topKOpt = useMemo(() => ({
  textStyle: { fontSize: VIZ_FONT.base,
    color: axisLabelColor,
  },
  tooltip: {
    trigger: 'axis',
    formatter: (p: ChartParam[]) => `${p[0]?.name ?? ''}: ${fmtNum(Number(p[0]?.value ?? NaN))}`
  },
  grid: { left: 120, right: 20, top: 20, bottom: 55 },
  xAxis: {
    type: 'value', name: 'Predicted bp / kb', nameLocation: 'middle', nameGap: 30,
    nameTextStyle: { fontSize: VIZ_FONT.base, color: axisNameColor },
    axisLabel: { fontSize: VIZ_FONT.base,
      formatter: (v: number | string) => fmtNum(Number(v)),
      color: axisLabelColor
    }
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: topK.map(d => d.label),
    axisLabel: { fontSize: VIZ_FONT.base,
      color: axisLabelColor,
      formatter: shortenKingdom
    }
  },
  legend: {
    show: false, // ή true αν θες
    textStyle: { fontSize: VIZ_FONT.base, color: axisLabelColor }
  },
  series: [{
    type: 'bar',
    itemStyle: { borderColor: '#000000', borderWidth: 1 },
    data: topK.map(d => ({
      value: d.n,
      itemStyle: { borderColor: '#000000', borderWidth: 1, color: skColor(d.superkingdom) }
    }))
  }]
}), [topK, axisLabelColor, axisNameColor]);

const histOpt = useMemo(() => ({
  textStyle: { fontSize: VIZ_FONT.base,
    color: axisLabelColor,
  },
  tooltip: {
    trigger: 'axis',
    formatter: (p: ChartParam[]) => `${p[0]?.axisValue}: ${fmtNum(Number(p[0]?.value ?? NaN))}`
  },
  grid: {
    left: 80,
    right: 20,
    top: 30,
    bottom: 80,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    name: 'Score',
    nameLocation: 'middle',
    nameGap: 50,
    nameTextStyle: { fontSize: VIZ_FONT.base, color: axisNameColor },
    data: hist.map(d => d.bin),
    axisLabel: { fontSize: VIZ_FONT.base,
      margin: 14,
      rotate: 45,
      formatter: (v: number | string) => String(v),
      color: axisLabelColor
    }
  },
  yAxis: {
    type: 'log',
    logBase: 10,
    min: 1,
    name: 'Counts',
    nameTextStyle: { fontSize: VIZ_FONT.base, color: axisNameColor },
    nameLocation: 'middle',
    nameGap: 70,
    axisLabel: { fontSize: VIZ_FONT.base,
      formatter: (v: number | string) => fmtInt(Number(v)),
      color: axisLabelColor
    }
  },
  series: [{
    type: 'bar',
    itemStyle: { borderColor: '#000000', borderWidth: 1 },
    data: hist.map(d => d.n)
  }]
}), [hist, axisLabelColor, axisNameColor]);

const scatterOpt = useMemo(() => {
  const bySK = new Map<string, [number, number][]>();
  scatter.forEach(p => {
    const key = p.sk || '(unknown)';
    const arr = bySK.get(key) || [];
    arr.push([p.gs, p.gc]);
    bySK.set(key, arr);
  });

  return {
    textStyle: { fontSize: VIZ_FONT.base,
      color: axisLabelColor,
    },
    tooltip: {
      trigger: 'item',
      formatter: (p: ChartParam) => {
        const value = Array.isArray(p.value) ? p.value : [];
        return `${p.seriesName}<br/>Genome size: ${fmtInt(Number(value[0]))} bp<br/>GC%: ${fmtNum(Number(value[1]))}`;
      }
    },
    grid: {
      left: 80,
      right: 20,
      top: 30,
      bottom: 80,
      containLabel: true
    },
    xAxis: {
      type: 'log',
      logBase: 10,
      min: 1,
      name: 'Genome size (log{sub|10})',
      nameTextStyle: { fontSize: VIZ_FONT.base,
        color: axisNameColor,
        rich: {
          sub: {
            color: axisNameColor,
            fontSize: VIZ_FONT.subscript,
            verticalAlign: 'bottom',
            padding: [6, 0, 0, 0]
          }
        }
      },
      nameLocation: 'middle',
      nameGap: 65,
      axisLabel: { fontSize: VIZ_FONT.base,
        formatter: (v: number) => fmtInt(Number(v)),
        margin: 20,
        rotate: 45,
        align: 'right',
        color: axisLabelColor
      }
    },
    yAxis: {
      type: 'value',
      name: 'GC (%)',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { fontSize: VIZ_FONT.base, color: axisNameColor },
      axisLabel: { fontSize: VIZ_FONT.base,
        formatter: (v: number) => fmtNum(Number(v)),
        color: axisLabelColor
      }
    },
    legend: { show: false },
    series: Array.from(bySK.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, pts]) => ({
        name,
        type: 'scatter',
        symbolSize: 6,
        data: pts,
        itemStyle: {
          // ίδιο χρώμα με το Superkingdom distribution
          color: skColor(name),
        },
      })),
  };
}, [scatter, axisLabelColor, axisNameColor]);


const skBarOpt = useMemo(() => {
  const sorted = [...sk].sort((a, b) => a.label.localeCompare(b.label));
  const categories = sorted.map(s => s.label);

  const seriesData = sorted.map((s) => ({
    value: s.n,
    itemStyle: { borderColor: '#000000', borderWidth: 1, color: skColor(s.label) }
  }));

  return {
    textStyle: { fontSize: VIZ_FONT.base,
      color: axisLabelColor,
    },
    tooltip: {
      trigger: 'item',
      formatter: (p: ChartParam) =>
        `${p.name}<br/>Count: ${fmtInt(Number(p.value))}`
    },
    legend: {
      show: true,
      bottom: 0,
      type: 'scroll',
      data: categories,
      textStyle: { fontSize: VIZ_FONT.base, color: axisLabelColor },
      pageIconColor: axisLabelColor,
      itemWidth: 14,
      itemHeight: 10
    },
    grid: { left: 40, right: 20, top: 20, bottom: 120, containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { fontSize: VIZ_FONT.base,
        interval: 0,
        rotate: 45,
        color: axisLabelColor
      }
    },
    yAxis: {
      type: 'log', logBase: 10, min: 1,
      name: 'Counts',
      nameTextStyle: { fontSize: VIZ_FONT.base, color: axisNameColor },
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: { fontSize: VIZ_FONT.base,
        formatter: (v: number | string) => fmtInt(Number(v)),
        color: axisLabelColor
      }
    },
    series: sorted.map((s, i) => ({
      type: 'bar', name: s.label, barGap: '-100%',
      itemStyle: { borderColor: '#000000', borderWidth: 1, color: skColor(s.label) },
      data: sorted.map((_, j) => j === i ? seriesData[i] : null),
      emphasis: { focus: 'series' }
    }))
  };
}, [sk, axisLabelColor, axisNameColor]);

  return (
    <Box sx={{ mt: 4,
      '& .MuiTypography-caption': { fontSize: VIZ_MUI_FONT.caption },
      '& .MuiTypography-h6': { fontSize: VIZ_MUI_FONT.metric },
      '& .MuiTypography-subtitle2': { fontSize: VIZ_MUI_FONT.chartTitle },
    }}>
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
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Total assemblies</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>
                  {fmtInt(totalAssemblies)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Unique species taxids</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>
                  {fmtInt(uniqueTaxids)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Avg. genome size</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtInt(avgGenome)} bp</Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Avg. %GC</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtNum(avgGC)}%</Typography>
              </Paper>
            </Grid>
          </Grid>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Counts include all assemblies, including those with no predictions. Genome size, GC and kingdom density
            are averaged within species taxids, then across species; missing values are omitted per metric.
          </Typography>
          {/* Charts */}
          <Grid container spacing={2} sx={{ width: '100%' }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Superkingdom distribution</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={skBarOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Kingdoms with highest Z-DNA / Z-RNA density</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={topKOpt} />
                </Box>
              </Paper>
            </Grid>
          </Grid>
          <br></br>

          <Grid container spacing={2} sx={{ width: '100%', mt: 0 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, marginBottom: '12px' }}>Scores distribution (sampled)</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={histOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Genome size vs %GC (sampled)</Typography>
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
