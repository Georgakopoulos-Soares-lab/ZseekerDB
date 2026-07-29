// src/pages/HomeInsights.tsx
import { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Paper, Typography, CircularProgress } from '@mui/material';
import ReactECharts from 'echarts-for-react';
import { useTheme } from '@mui/material/styles';
import { VIZ_FONT, VIZ_MUI_FONT } from '../utils/visualizationTypography';

const fmtNum = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
    : '—';

const fmtInt = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
    : '—';

type KV = { label: string; n: number };
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
  const [scatter, setScatter] = useState<{ gs: number; gc: number; sk: string }[]>([]);

  const theme = useTheme();
  const axisLabelColor = theme.palette.mode === 'dark' ? '#ffffff' : '#666666';
  const axisNameColor = theme.palette.mode === 'dark' ? '#ffffff' : '#333333';

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setLoading(true); setError(null);

        // Single request — backend runs all 5 queries in parallel and caches for 15 min.
        const res = await fetch('/api/home/insights', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();

        if (dead) return;
        setTotalAssemblies(d.kpis.total_assemblies);
        setUniqueTaxids(d.kpis.unique_taxids);
        setAvgGenome(d.kpis.avg_genome_size);
        setAvgGC(d.kpis.avg_gc);

        setSK((d.superkingdoms ?? []).map((r: any) => ({ label: String(r.label), n: Number(r.n) })));
        setTopK((d.top_kingdoms ?? []).map((r: any) => ({
          label: String(r.label),
          density: Number(r.density ?? 0),
          superkingdom: String(r.superkingdom ?? '(unknown)'),
          assemblyCount: Number(r.assembly_count ?? 0),
          uniqueTaxids: Number(r.unique_taxids ?? 0),
        })));
        setHist((d.histogram ?? []).map((r: any) => ({ bin: Number(r.bin), n: Number(r.n) })));
        setScatter((d.scatter ?? []).map((r: any) => ({ gs: Number(r.gs), gc: Number(r.gc), sk: String(r.sk || '') })));
      } catch (e: any) {
        if (!dead) setError(e?.message || 'Failed to load home insights');
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  // ECharts options
  // palette for bars (repeats if more categories than colors)
  const PALETTE = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ac'
  ];

  // map superkingdom -> color (same ordering used in skBar)
  const skColorMap = useMemo(() => {
    const sorted = [...sk].sort((a, b) => a.label.localeCompare(b.label));
    return Object.fromEntries(sorted.map((s, i) => [s.label, PALETTE[i % PALETTE.length]]));
  }, [sk]);

  // palette for bars (repeats if more categories than colors)
  const PALETTE2 = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ac'
  ];

  // ίδιο mapping superkingdom -> χρώμα για όλα τα plots που βασίζονται στα superkingdoms
  const skColorMap2 = useMemo(() => {
    const sorted = [...sk].sort((a, b) => a.label.localeCompare(b.label));
    const map: Record<string, string> = {};
    sorted.forEach((s, i) => {
      map[s.label] = PALETTE2[i % PALETTE2.length];
    });
    return map;
  }, [sk]);

  const topKOpt = useMemo(() => ({
    textStyle: {
      color: axisLabelColor,
      fontSize: VIZ_FONT.base,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => {
        const point = p[0];
        const data = point?.data ?? {};
        return [
          point?.name ?? '',
          `Taxid-balanced mean density: ${fmtNum(point?.value ?? null)} /kb`,
          `Assemblies: ${fmtInt(data.assemblyCount)}`,
          `Unique taxids: ${fmtInt(data.uniqueTaxids)}`,
        ].join('<br/>');
      },
      textStyle: { fontSize: VIZ_FONT.defaultTooltip },
    },
    grid: { left: 120, right: 20, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: any) => fmtNum(Number(v)),
        color: axisLabelColor,
        fontSize: VIZ_FONT.base,
      }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: topK.map(d => d.label),
      axisLabel: {
        color: axisLabelColor,
        fontSize: VIZ_FONT.base,
      }
    },
    legend: {
      show: false, // ή true αν θες
      textStyle: { color: axisLabelColor, fontSize: VIZ_FONT.base }
    },
    series: [{
      type: 'bar',
      data: topK.map(d => ({
        value: d.density,
        assemblyCount: d.assemblyCount,
        uniqueTaxids: d.uniqueTaxids,
        itemStyle: { color: skColorMap[d.superkingdom] ?? PALETTE[0] }
      }))
    }]
  }), [topK, skColorMap, axisLabelColor]);

  const histOpt = useMemo(() => ({
    textStyle: {
      color: axisLabelColor,
      fontSize: VIZ_FONT.base,
    },
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => `${p[0]?.axisValue}: ${fmtNum(p[0]?.value ?? null)}`,
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
      nameGap: 50,
      nameTextStyle: { color: axisNameColor, fontSize: VIZ_FONT.base },
      data: hist.map(d => d.bin),
      axisLabel: {
        margin: 14,
        rotate: 45,
        formatter: (v: any) => String(v),
        color: axisLabelColor,
        fontSize: VIZ_FONT.base,
      }
    },
    yAxis: {
      type: 'log',
      logBase: 10,
      min: 1,
      name: 'Counts (log{sub|10})',
      nameTextStyle: {
        color: axisNameColor,   // βασικό text
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
      nameGap: 70,
      axisLabel: {
        formatter: (v: any) => fmtInt(Number(v)),
        color: axisLabelColor,
        fontSize: VIZ_FONT.base,
      }
    },
    series: [{
      type: 'bar',
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
      textStyle: {
        color: axisLabelColor,
        fontSize: VIZ_FONT.base,
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `Genome size: ${fmtNum(p.value[0])}<br/>GC%: ${fmtNum(p.value[1])}`,
        textStyle: { fontSize: VIZ_FONT.defaultTooltip },
      },
      grid: {
        left: 80,
        right: 20,
        top: 30,
        bottom: 110,
        containLabel: true
      },
      xAxis: {
        type: 'log',
        logBase: 10,
        min: 1,
        name: 'Genome size (log{sub|10})',
        nameTextStyle: {
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
        nameGap: 110,
        axisLabel: {
          formatter: (v: number) => fmtInt(Number(v)),
          margin: 20,
          rotate: 45,
          align: 'right',
          color: axisLabelColor,
          fontSize: VIZ_FONT.base,
        }
      },
      yAxis: {
        type: 'value',
        name: 'GC (%)',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: axisNameColor, fontSize: VIZ_FONT.base },
        axisLabel: {
          formatter: (v: number) => fmtNum(Number(v)),
          color: axisLabelColor,
          fontSize: VIZ_FONT.base,
        }
      },
      legend: {
        bottom: 0,
        textStyle: { color: axisLabelColor, fontSize: VIZ_FONT.base }
      },
      series: Array.from(bySK.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, pts], idx) => ({
          name,
          type: 'scatter',
          symbolSize: 6,
          data: pts,
          itemStyle: {
            // ίδιο χρώμα με το Superkingdom distribution
            color: skColorMap2[name] ?? PALETTE2[idx % PALETTE2.length],
          },
        })),
    };
  }, [scatter, axisLabelColor, axisNameColor, skColorMap2]);


  const skBarOpt = useMemo(() => {
    const sorted = [...sk].sort((a, b) => a.label.localeCompare(b.label));
    const categories = sorted.map(s => s.label);

    const seriesData = sorted.map((s, i) => ({
      value: Math.log10((s.n ?? 0) + 1),
      raw: s.n ?? 0,
      itemStyle: { color: PALETTE2[i % PALETTE2.length] }
    }));

    return {
      textStyle: {
        color: axisLabelColor,
        fontSize: VIZ_FONT.base,
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) =>
          `${p.name}<br/>Assembly count: ${p.data.raw}<br/>Normalized (log10): ${fmtNum(Number(p.data.value))}`,
        textStyle: { fontSize: VIZ_FONT.defaultTooltip },
      },
      legend: {
        show: true,
        bottom: 0,
        type: 'scroll',
        data: categories,
        textStyle: { color: axisLabelColor, fontSize: VIZ_FONT.base },
        pageIconColor: axisLabelColor,
        itemWidth: 14,
        itemHeight: 10
      },
      grid: { left: 40, right: 20, top: 20, bottom: 120, containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          interval: 0,
          rotate: 45,
          color: axisLabelColor,
          fontSize: VIZ_FONT.base,
        }
      },
      yAxis: {
        type: 'value',
        name: 'Counts (log{sub|10})',
        nameTextStyle: {
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
        nameGap: 40,
        axisLabel: {
          formatter: (v: any) => fmtNum(Number(v)),
          color: axisLabelColor,
          fontSize: VIZ_FONT.base,
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
  }, [sk, axisLabelColor, axisNameColor]);

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
            <Grid item xs={12} sm={6} md={3} sx={{ minWidth: '24%' }}>
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
            <Grid item xs={12} sm={6} md={3} sx={{ minWidth: '23%' }}>
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
            <Grid item xs={12} sm={6} md={3} sx={{ minWidth: '24%' }}>
              <Paper sx={{ p: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: VIZ_MUI_FONT.caption }}
                >
                  Avg. genome size
                </Typography>
                <Typography variant="h6" sx={{ mt: .5, fontSize: VIZ_MUI_FONT.cardTitle }}>
                  {fmtNum(avgGenome)}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{ minWidth: '23%' }}>
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

          {/* Charts: 2 ανά σειρά */}
          <Grid container spacing={2} sx={{ width: '100%' }}>
            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ mb: 1, fontSize: VIZ_MUI_FONT.sectionTitle }}
                >
                  Superkingdom distribution
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={skBarOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ mb: 1, fontSize: VIZ_MUI_FONT.sectionTitle }}
                >
                  10 kingdoms with highest taxid-balanced Z-DNA/-RNA densities
                </Typography>
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
                <Typography
                  variant="subtitle2"
                  sx={{ mb: 1, marginBottom: '12px', fontSize: VIZ_MUI_FONT.sectionTitle }}
                >
                  Scores distribution (sampled)
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={histOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ mb: 1, fontSize: VIZ_MUI_FONT.sectionTitle }}
                >
                  Genome size vs %GC (sampled)
                </Typography>
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
