// src/pages/HomeInsights.tsx
import { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Paper, Typography, CircularProgress } from '@mui/material';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '@mui/material/styles';
import { skColor } from '../utils/superkingdomColors';
import { shortenTaxonLabel } from '../utils/shortenLabel';
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

type KV = { label: string; n: number; taxids: number };

type InsightsResponse = {
  kpis: { total_assemblies: number; unique_taxids: number; avg_genome_size: number; avg_gc: number };
  superkingdoms?: { label: string; n: number; taxids: number }[];
  top_kingdoms?: { label: string; density?: number; superkingdom?: string; assembly_count?: number; unique_taxids?: number }[];
  histogram?: { bin: number; n: number }[];
};

const barOutline = { borderColor: '#000000', borderWidth: 1 };
type TopKingdom = {
  label: string;
  density: number;
  assemblyCount: number;
  uniqueTaxids: number;
  superkingdom: string;
};

export default function HomeInsights() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // KPIs
  const [totalAssemblies, setTotalAssemblies] = useState<number | null>(null);
  const [uniqueTaxids, setUniqueTaxids] = useState<number | null>(null);
  const [avgGenome, setAvgGenome] = useState<number | null>(null);
  const [avgGC, setAvgGC] = useState<number | null>(null);

  // Charts
  const [sk, setSK] = useState<KV[]>([]);
  const [topK, setTopK] = useState<TopKingdom[]>([]);
  const [hist, setHist] = useState<{ bin: number; n: number }[]>([]);

  const theme = useTheme();
  const axisLabelColor = theme.palette.mode === 'dark' ? '#ffffff' : '#666666';
  const axisNameColor = theme.palette.mode === 'dark' ? '#ffffff' : '#333333';

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setLoading(true); setError(null);

        // Single request — backend computes all charts once and serves them from memory.
        const res = await fetch('/api/home/insights', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json() as InsightsResponse;

        if (dead) return;
        setTotalAssemblies(d.kpis.total_assemblies);
        setUniqueTaxids(d.kpis.unique_taxids);
        setAvgGenome(d.kpis.avg_genome_size);
        setAvgGC(d.kpis.avg_gc);

        setSK((d.superkingdoms ?? []).map(r => ({ label: String(r.label), n: Number(r.n), taxids: Number(r.taxids) })));
        setTopK((d.top_kingdoms ?? []).map(r => ({
          label: String(r.label),
          density: Number(r.density ?? 0),
          superkingdom: String(r.superkingdom ?? '(unknown)'),
          assemblyCount: Number(r.assembly_count ?? 0),
          uniqueTaxids: Number(r.unique_taxids ?? 0),
        })));
        setHist((d.histogram ?? []).map(r => ({ bin: Number(r.bin), n: Number(r.n) })));
      } catch (e) {
        if (!dead) setError((e instanceof Error && e.message) || 'Failed to load home insights');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  // ECharts options
  const PLOT_FONT = VIZ_FONT.base;
  // Axis lines: thicker and black (white in dark mode).
  const axisLine = useMemo(() => ({
    show: true,
    lineStyle: { color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000', width: 2 },
  }), [theme.palette.mode]);

  const topKOpt = useMemo(() => ({
    textStyle: {
      color: axisLabelColor,
      fontSize: PLOT_FONT,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (p: ChartParam[]) => {
        const point = p[0];
        const data = point?.data ?? {};
        return [
          point?.name ?? '',
          `Taxid-balanced mean density: ${fmtNum(Number(point?.value))} /kb`,
          `Assemblies: ${fmtInt(Number(data.assemblyCount))}`,
          `Unique taxids: ${fmtInt(Number(data.uniqueTaxids))}`,
        ].join('<br/>');
      },
      textStyle: { fontSize: VIZ_FONT.defaultTooltip },
    },
    grid: { left: 10, right: 30, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'value',
      axisLine,
      axisLabel: {
        formatter: (v: string | number) => fmtInt(Number(v)),
        color: axisLabelColor,
        fontSize: PLOT_FONT,
      }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      axisLine,
      data: topK.map(d => d.label),
      axisLabel: {
        formatter: (v: string) => shortenTaxonLabel(v),
        color: axisLabelColor,
        fontSize: PLOT_FONT,
      }
    },
    legend: {
      show: false,
      textStyle: { color: axisLabelColor, fontSize: PLOT_FONT }
    },
    series: [{
      type: 'bar',
      data: topK.map(d => ({
        value: d.density,
        assemblyCount: d.assemblyCount,
        uniqueTaxids: d.uniqueTaxids,
        itemStyle: { color: skColor(d.superkingdom), ...barOutline }
      }))
    }]
  }), [topK, axisLabelColor, PLOT_FONT, axisLine]);

  const histOpt = useMemo(() => ({
    textStyle: {
      color: axisLabelColor,
      fontSize: PLOT_FONT,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (p: ChartParam[]) => `${p[0]?.axisValue}: ${fmtInt(Number(p[0]?.value))}`,
      textStyle: { fontSize: VIZ_FONT.defaultTooltip },
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
      nameGap: 55,
      nameTextStyle: { color: axisNameColor, fontSize: PLOT_FONT },
      axisLine,
      data: hist.map(d => d.bin),
      axisLabel: {
        margin: 14,
        rotate: 45,
        formatter: (v: string | number) => String(v),
        color: axisLabelColor,
        fontSize: PLOT_FONT,
      }
    },
    yAxis: {
      type: 'log',
      logBase: 10,
      min: 1,
      name: 'Counts',
      nameTextStyle: { color: axisNameColor, fontSize: PLOT_FONT },
      nameLocation: 'middle',
      nameGap: 80,
      axisLine,
      axisLabel: {
        formatter: (v: string | number) => fmtInt(Number(v)),
        color: axisLabelColor,
        fontSize: PLOT_FONT,
      }
    },
    series: [{
      type: 'bar',
      data: hist.map(d => d.n)
    }]
  }), [hist, axisLabelColor, axisNameColor, PLOT_FONT, axisLine]);

  // Superkingdom bar charts (assemblies / unique species taxids). Same log10
  // y-axis with real-count tick labels as the score histogram.
  const skBarOption = (valueOf: (s: KV) => number, countLabel: string) => {
    const sorted = [...sk].sort((a, b) => a.label.localeCompare(b.label));
    const categories = sorted.map(s => s.label);

    const seriesData = sorted.map((s) => ({
      value: valueOf(s) ?? 0,
      raw: valueOf(s) ?? 0,
      itemStyle: { color: skColor(s.label), ...barOutline }
    }));

    return {
      textStyle: {
        color: axisLabelColor,
        fontSize: PLOT_FONT,
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: ChartParam) =>
          `${p.name}<br/>${countLabel}: ${p.data?.raw}`,
        textStyle: { fontSize: VIZ_FONT.defaultTooltip },
      },
      legend: {
        show: true,
        bottom: 0,
        type: 'scroll',
        data: categories,
        textStyle: { color: axisLabelColor, fontSize: PLOT_FONT },
        pageIconColor: axisLabelColor,
        itemWidth: 14,
        itemHeight: 10
      },
      grid: { left: 80, right: 20, top: 20, bottom: 10, containLabel: true },
      xAxis: {
        type: 'category',
        axisLine,
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: 45,
          color: axisLabelColor,
          fontSize: PLOT_FONT,
        }
      },
      yAxis: {
        type: 'log',
        logBase: 10,
        min: 1,
        name: 'Counts',
        nameTextStyle: { color: axisNameColor, fontSize: PLOT_FONT },
        nameLocation: 'middle',
        nameGap: 80,
        axisLine,
        axisLabel: {
          formatter: (v: string | number) => fmtInt(Number(v)),
          color: axisLabelColor,
          fontSize: PLOT_FONT,
        }
      },
      series: [
        {
          type: 'bar',
          name: 'Superkingdom',
          data: seriesData,
          emphasis: { focus: 'series' }
        }
      ]
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const skBarOpt = useMemo(() => skBarOption(s => s.n, 'Assembly count'), [sk, axisLabelColor, axisNameColor, PLOT_FONT, axisLine]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const skTaxidBarOpt = useMemo(() => skBarOption(s => s.taxids, 'Unique taxids'), [sk, axisLabelColor, axisNameColor, PLOT_FONT, axisLine]);

  const chartTitleSx = { mb: 1, fontSize: VIZ_MUI_FONT.chartTitle };
  const chartCard = (title: string, option: Record<string, unknown>) => (
    <Grid size={{ xs: 12, md: 6 }}>
      <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Typography variant="subtitle2" sx={chartTitleSx}>
          {title}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ReactECharts style={{ width: '100%', height: '100%' }} option={option} />
        </Box>
      </Paper>
    </Grid>
  );

  return (
    <Box sx={{ mt: 4 }}>
      <Typography
        variant="h5"
        sx={{ mb: 2, fontWeight: 700, fontSize: VIZ_MUI_FONT.pageTitle }}
      >
        Quick dataset insights
      </Typography>

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
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: VIZ_MUI_FONT.caption }}
                >
                  Total assemblies
                </Typography>
                <Typography variant="h6" sx={{ mt: .5, fontSize: VIZ_MUI_FONT.cardTitle }}>
                  {fmtInt(totalAssemblies)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: VIZ_MUI_FONT.caption }}
                >
                  Unique taxids
                </Typography>
                <Typography variant="h6" sx={{ mt: .5, fontSize: VIZ_MUI_FONT.cardTitle }}>
                  {fmtInt(uniqueTaxids)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: VIZ_MUI_FONT.caption }}
                >
                  Avg. genome size (bp)
                </Typography>
                <Typography variant="h6" sx={{ mt: .5, fontSize: VIZ_MUI_FONT.cardTitle }}>
                  {fmtInt(avgGenome == null ? null : Math.round(avgGenome / 10) * 10)}
                </Typography>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: VIZ_MUI_FONT.caption }}
                >
                  Avg. %GC
                </Typography>
                <Typography variant="h6" sx={{ mt: .5, fontSize: VIZ_MUI_FONT.cardTitle }}>
                  {fmtNum(avgGC)}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            {chartCard('Assemblies by Superkingdom', skBarOpt)}
            {chartCard('Taxonomy IDs by Superkingdom', skTaxidBarOpt)}
          </Grid>

          <Grid container spacing={2} sx={{ mt: 2 }}>
            {chartCard('Highest Z-DNA density kingdoms', topKOpt)}
            {chartCard('Z-DNA scores distribution (sampled)', histOpt)}
          </Grid>
        </>
      )}
    </Box>
  );
}
