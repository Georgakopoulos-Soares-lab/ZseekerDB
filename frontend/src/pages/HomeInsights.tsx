// src/pages/HomeInsights.tsx
import { useEffect, useMemo, useState } from 'react';
import { Box, Grid, Paper, Typography, CircularProgress } from '@mui/material';
import ReactECharts from 'echarts-for-react';
import { minWidth } from '@mui/system';
import { useTheme } from '@mui/material/styles';

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

const fmtNum = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
    : '—';

const fmtInt = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
    : '—';

type KV = { label: string; n: number; superkingdom?: string };

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

  const theme = useTheme();
  const axisLabelColor = theme.palette.mode === 'dark' ? '#ffffff' : '#666666';
  const axisNameColor = theme.palette.mode === 'dark' ? '#ffffff' : '#333333';

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
          WHERE genome_size >= 1000
        `);

        // Donut: superkingdoms
        const skRows = await fetchSql<KV>(`
          SELECT COALESCE(superkingdom,'(unknown)') AS label, COUNT(*) AS n
          FROM metadata
          WHERE genome_size >= 1000
          GROUP BY 1
          ORDER BY n DESC
        `);

        // Top 10 kingdoms — choose those with highest Z‑DNA/-RNA density (obs_density_per_kb)
        const topKRows = await fetchSql<any>(`
          SELECT
            kingdom AS label,
            AVG(TRY_CAST(obs_density_per_kb AS DOUBLE)) AS density,
            COUNT(*) AS cnt,
            COALESCE(MAX(superkingdom), '(unknown)') AS superkingdom
          FROM metadata
          WHERE kingdom IS NOT NULL AND 
            kingdom <> '' AND 
            obs_density_per_kb IS NOT NULL AND 
            genome_size >= 1000
          GROUP BY 1
          ORDER BY density DESC
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
            AND genome_size >= 1000
          USING SAMPLE 20000 ROWS
        `);

        if (dead) return;
        setTotalAssemblies(parseInt(ov?.total_assemblies ?? 0, 10));
        setUniqueTaxids(parseInt(ov?.unique_taxids ?? 0, 10));

        setAvgGenome(Number(ov?.avg_genome_size ?? null));
        setAvgGC(Number(ov?.avg_gc ?? null));

        setSK(skRows);
        // topK now carries density in `n` (used for plotting) and cnt as raw count
        setTopK(topKRows.map((r: any) => ({
          label: String(r.label),
          n: Number(r.density ?? 0),               // density per kb (plotted)
          superkingdom: String(r.superkingdom ?? '(unknown)'),
          // keep the raw count available if needed (not part of KV type but harmless)
          cnt: Number(r.cnt ?? 0)
        })));
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
  textStyle: {
    color: axisLabelColor,
  },
  tooltip: {
    trigger: 'item',
    formatter: (p: any) => `${p.name}<br/>${fmtNum(p.value)} (${fmtNum(p.percent)}%)`
  },
  legend: {
    bottom: 0,
    type: 'scroll',
    textStyle: { color: axisLabelColor }
  },
  series: [{
    type: 'pie',
    radius: ['50%','70%'],
    label: { show: false },
    data: sk.map(d => ({ name: d.label, value: d.n }))
  }]
}), [sk, axisLabelColor]);


  // palette for bars (repeats if more categories than colors)
  const PALETTE = [
    '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
    '#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ac'
  ];

  // map superkingdom -> color (same ordering used in skBar)
  const skColorMap = useMemo(() => {
    const sorted = [...sk].sort((a, b) => a.label.localeCompare(b.label));
    return Object.fromEntries(sorted.map((s, i) => [s.label, PALETTE[i % PALETTE.length]]));
  }, [sk]);

    // palette for bars (repeats if more categories than colors)
  const PALETTE2 = [
    '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
    '#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ac'
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
  },
  tooltip: {
    trigger: 'axis',
    formatter: (p: any) => `${p[0]?.name ?? ''}: ${fmtNum(p[0]?.value ?? null)}`
  },
  grid: { left: 120, right: 20, top: 20, bottom: 20 },
  xAxis: {
    type: 'value',
    axisLabel: {
      formatter: (v: any) => fmtNum(Number(v)),
      color: axisLabelColor
    }
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: topK.map(d => d.label),
    axisLabel: {
      color: axisLabelColor
    }
  },
  legend: {
    show: false, // ή true αν θες
    textStyle: { color: axisLabelColor }
  },
  series: [{
    type: 'bar',
    data: topK.map(d => ({
      value: d.n,
      itemStyle: { color: skColorMap[d.superkingdom ?? '(unknown)'] ?? PALETTE[0] }
    }))
  }]
}), [topK, skColorMap, axisLabelColor]);

const histOpt = useMemo(() => ({
  textStyle: {
    color: axisLabelColor,
  },
  tooltip: {
    trigger: 'axis',
    formatter: (p: any) => `${p[0]?.axisValue}: ${fmtNum(p[0]?.value ?? null)}`
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
    nameTextStyle: { color: axisNameColor },
    data: hist.map(d => d.bin),
    axisLabel: {
      margin: 14,
      rotate: 45,
      formatter: (v: any) => String(v),
      color: axisLabelColor
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
          fontSize: 7,
          verticalAlign: 'bottom',
          padding: [6, 0, 0, 0]
        }
      }
    },
    nameLocation: 'middle',
    nameGap: 70,
    axisLabel: {
      formatter: (v: any) => fmtInt(Number(v)),
      color: axisLabelColor
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
    },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) =>
        `Genome size: ${fmtNum(p.value[0])}<br/>GC%: ${fmtNum(p.value[1])}`
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
            fontSize: 7,
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
        color: axisLabelColor
      }
    },
    yAxis: { 
      type: 'value', 
      name: 'GC (%)',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: { color: axisNameColor },
      axisLabel: { 
        formatter: (v: number) => fmtNum(Number(v)),
        color: axisLabelColor
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: axisLabelColor }
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
    },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) =>
        `${p.name}<br/>Count: ${p.data.raw}<br/>Normalized (log10): ${fmtNum(Number(p.data.value))}`
    },
    legend: {
      show: true,
      bottom: 0,
      type: 'scroll',
      data: categories,
      textStyle: { color: axisLabelColor },
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
        color: axisLabelColor
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
            fontSize: 7,
            verticalAlign: 'bottom',
            padding: [6, 0, 0, 0]
          }
        }
      },
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        formatter: (v: any) => fmtNum(Number(v)),
        color: axisLabelColor
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
                <Typography variant="h6" sx={{ mt: .5 }}>
                  {fmtInt(totalAssemblies)}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '23%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Unique taxids</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>
                  {fmtInt(uniqueTaxids)}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '24%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Avg. genome size</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtNum(avgGenome)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3} sx={{minWidth: '23%'}}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">Avg. %GC</Typography>
                <Typography variant="h6" sx={{ mt: .5 }}>{fmtNum(avgGC)}</Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* Charts: 2 ανά σειρά */}
          <Grid container spacing={2} sx={{ width: '100%' }}>
            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Superkingdom distribution</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={skBarOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
              <Paper sx={{ p: 2, height: 380, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>10 Kingdoms with highest Z-DNA/-RNA densities</Typography>
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
                <Typography variant="subtitle2" sx={{ mb: 1, marginBottom: '12px' }}>Scores distribution (sampled)</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <ReactECharts style={{ width: '100%', height: '100%' }} option={histOpt} />
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ minWidth: '48%' }}>
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
