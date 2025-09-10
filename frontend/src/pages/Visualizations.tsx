import * as React from 'react';
import {
  Paper, Typography, Box, Stack, LinearProgress, Button,
  Slider, Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

type DonutField = 'class' | 'kingdom' | 'phylum' | 'superkingdom';

export default function Visualizations() {
  // --- Donut state ---
  const [donutLoading, setDonutLoading] = React.useState(true);
  const [donutLabels, setDonutLabels] = React.useState<string[]>([]);
  const [donutValues, setDonutValues] = React.useState<number[]>([]);
  const [donutField, setDonutField] = React.useState<DonutField>('class');

  // --- Histogram state ---
  const [histLoading, setHistLoading] = React.useState(true);
  const [histLabels, setHistLabels] = React.useState<string[]>([]);
  const [histValues, setHistValues] = React.useState<number[]>([]);
  const [bin, setBin] = React.useState<number>(50);
  const [binDraft, setBinDraft] = React.useState<number>(50);
  const [approx, setApprox] = React.useState<boolean>(true);

  // ---- helpers: small CSV exports ----
  function downloadCSV(filename: string, rows: string[][]) {
    const csv = rows.map(r => r.map(x => {
      const s = x ?? '';
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).
      join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const downloadDonut = () => {
    const rows = [['label', 'value'], ...donutLabels.map((l, i) => [String(l), String(donutValues[i] ?? 0)])];
    downloadCSV(`top_${donutField}.csv`, rows);
  };
  const downloadHist = () => {
    const rows = [['bin_start', 'count'], ...histLabels.map((l, i) => [String(l), String(histValues[i] ?? 0)])];
    downloadCSV(`zdna_hist_bin${bin}.csv`, rows);
  };

  // ---- Fetches ----
  const fetchDonut = React.useCallback(async (field: DonutField) => {
    setDonutLoading(true);
    try {
      const a = await fetch(`/api/metadata/classes/top?limit=12&field=${field}`).then(r => r.json());
      const labels = Array.isArray(a.labels) ? a.labels
                    : (a.rows || []).map((x: any) => x.class);
      const values = Array.isArray(a.values) ? a.values.map(Number)
                    : (a.rows || []).map((x: any) => Number(x.n || 0));
      setDonutLabels(labels);
      setDonutValues(values);
    } finally {
      setDonutLoading(false);
    }
  }, []);
  React.useEffect(() => { fetchDonut(donutField); }, [donutField, fetchDonut]);

  const fetchHistogram = React.useCallback(async (b: number, ap: boolean) => {
    setHistLoading(true);
    try {
      const res = await fetch(`/api/zdna/score_histogram?bin=${b}&approx=${ap ? 1 : 0}`).then(r => r.json());
      const labels = Array.isArray(res.labels) ? res.labels.map(String)
                    : (res.bins || []).map((x: any) => String(x.bin_start));
      const values = Array.isArray(res.values) ? res.values.map(Number)
                    : (res.bins || []).map((x: any) => Number(x.n || 0));
      setHistLabels(labels);
      setHistValues(values);
    } finally {
      setHistLoading(false);
    }
  }, []);
  React.useEffect(() => { fetchHistogram(bin, approx); }, [bin, approx, fetchHistogram]);

  // ---- ECharts options ----
  const titleCase = (s: string) => s.slice(0,1).toUpperCase() + s.slice(1);

  const donutOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { top: 'bottom' },
    series: [
      {
        name: `${titleCase(donutField)} count`,
        type: 'pie',
        radius: ['50%', '75%'],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, formatter: '{b}: {c}' } },
        data: donutLabels.map((name, i) => ({ name, value: donutValues[i] ?? 0 })),
      }
    ]
  };

  const step = Math.max(1, Math.ceil(histLabels.length / 24));
  const histOption: EChartsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 20, bottom: 60 },
    dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 18 }],
    xAxis: {
      type: 'category',
      name: `Score (bin=${bin})`,
      data: histLabels,
      axisLabel: { interval: (idx: number) => idx % step === 0, hideOverlap: true, rotate: histLabels.length > 40 ? 40 : 0 }
    },
    yAxis: { type: 'value', name: 'Count', axisLabel: { formatter: (v: any) => Number(v).toLocaleString() } },
    series: [{ name: 'Count', type: 'bar', data: histValues, large: true, largeThreshold: 1000, barMaxWidth: 12 }]
  };

  return (
    <Stack spacing={3}>
      {/* Donut */}
      <Paper elevation={1} sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Top classes (metadata)</Typography>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="donut-field-label">Field</InputLabel>
            <Select
              labelId="donut-field-label"
              label="Field"
              value={donutField}
              onChange={(e) => setDonutField(e.target.value as DonutField)}
            >
              <MenuItem value="class">Class</MenuItem>
              <MenuItem value="kingdom">Kingdom</MenuItem>
              <MenuItem value="phylum">Phylum</MenuItem>
              <MenuItem value="superkingdom">Superkingdom</MenuItem>
            </Select>
          </FormControl>
          <Button size="small" onClick={downloadDonut}>Download CSV</Button>
          {donutLoading && <LinearProgress sx={{ width: 160 }} />}
        </Stack>
        <Box sx={{ width: '100%', height: 360 }}>
          {!donutLoading && <ReactECharts option={donutOption} style={{ height: 360 }} notMerge />}
        </Box>
      </Paper>

      {/* Histogram */}
      <Paper elevation={1} sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
          <Typography variant="h6" sx={{ mr: 2, flexShrink: 0 }}>
            Z-DNA Score histogram (server‑side)
          </Typography>

          <Typography variant="body2">Bin</Typography>
          <Box sx={{ width: 180 }}>
            <Slider size="small" min={5} max={200} step={5} value={binDraft} onChange={(_, v) => setBinDraft(v as number)} />
          </Box>
          <Typography variant="body2" sx={{ minWidth: 30, textAlign: 'right' }}>{binDraft}</Typography>

          <FormControlLabel
            sx={{ ml: 1 }}
            control={<Switch checked={approx} onChange={(e) => setApprox(e.target.checked)} />}
            label="Fast (sample)"
          />

          <Button variant="contained" size="small" onClick={() => setBin(binDraft)} disabled={histLoading}>Apply</Button>
          <Button size="small" onClick={() => { setBinDraft(50); setBin(50); setApprox(true); }} disabled={histLoading}>Reset</Button>
          <Button size="small" onClick={downloadHist} disabled={histLoading}>Download CSV</Button>
          {histLoading && <LinearProgress sx={{ ml: 2, flex: 1, maxWidth: 160 }} />}
        </Stack>

        <Box sx={{ width: '100%', height: 380 }}>
          {!histLoading && <ReactECharts option={histOption} style={{ height: 360 }} notMerge />}
        </Box>
      </Paper>
    </Stack>
  );
}
