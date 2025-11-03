import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  Autocomplete,
  Box,
  Button,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography,
  CircularProgress,
  TablePagination,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Link,
  TableContainer,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { Link as RouterLink } from 'react-router-dom';

import RangeFilter from '../components/RangeFilter';
import { ColumnVisibilityMenu } from '../components/ColumnVisibilityMenu';
import BasicTaxonomy from '../components/BasicTaxonomy';
import { METADATA_COLUMNS } from '../components/DataTable';

// ---------------- helpers ----------------

async function distinct(field: string, upper: Record<string, string> = {}) {
  const sp = new URLSearchParams({ field });
  Object.entries(upper).forEach(([k, v]) => v && sp.set(k, v));
  const r = await fetch(`/api/metadata/distinct?${sp.toString()}`);
  const j = await r.json();
  return (j?.values ?? []) as string[];
}

type Ranges = {
  genome_size_min: number | '';
  genome_size_max: number | '';
  genome_size_ungapped_min: number | '';
  genome_size_ungapped_max: number | '';
  gc_percent_min: number | '';
  gc_percent_max: number | '';
};

// Case-insensitive finder on an array of column strings
const findCol = (cols: string[], nameLower: string) =>
  cols.find((c) => c.toLowerCase() === nameLower) ?? null;

// Build a simple histogram (equal bins)
function buildHistogram(values: number[], binCount = 20) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return { labels: [] as string[], counts: [] as number[] };
  const min = Math.min(...v), max = Math.max(...v);
  const width = (max - min) > 0 ? (max - min) / binCount : 1;
  const bins = Array.from({ length: binCount }, (_, i) => min + i * width);
  const counts = new Array(binCount).fill(0);
  for (const x of v) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((x - min) / width)));
    counts[idx]++;
  }
  const labels = bins.map((b) => `${Math.round(b)}–${Math.round(b + width)}`);
  return { labels, counts };
}

// Bubble size helper (sqrt scale) for scatter
function makeBubbleSizer(sizes: number[]) {
  const vals = sizes.filter((x) => Number.isFinite(x) && x > 0);
  if (vals.length === 0) return () => 8;
  const min = Math.min(...vals), max = Math.max(...vals);
  const smin = Math.sqrt(min), smax = Math.sqrt(max);
  return (x: number) => {
    if (!Number.isFinite(x) || x <= 0) return 8;
    const sx = Math.sqrt(x);
    const t = smax > smin ? (sx - smin) / (smax - smin) : 0;
    return 6 + t * 18; // 6–24 px
  };
}

/* CHART COLORS----------- palettes (distinct per chart) ---------------- */
const CHART_PALETTES = {
  genusBar: ['#4C78A8', '#9ECAE9', '#A0CBE8', '#6B6ECF'],      // μπλε αποχρώσεις
  scatter:  ['#F58518', '#54A24B', '#E45756', '#72B7B2', '#B279A2', '#FF9DA6'], // ζεστές+ψυχρές
  histGenome: ['#72B7B2', '#59A14F'],                           // teal/green
  histGC:     ['#E45756', '#F28E2B'],                           // κόκκινο/πορτοκαλί
} as const;


/** ---------------- Column resolve layer (dbName OR label) ---------------- **/
/** Reverse map: dbName -> label (from METADATA_COLUMNS) */
const DB_TO_LABEL: Record<string, string> = METADATA_COLUMNS.reduce((acc, c) => {
  acc[c.dbName.toLowerCase()] = c.label;
  return acc;
}, {} as Record<string, string>);

/** Extra aliases, incl. legacy names and display labels that may appear from API */
const COL_ALIASES: Record<string, string[]> = {
  // density (new db name + legacy + label)
  obs_density_per_kb: ['zdna_density', 'Z-DNA density (per kb)'],
  // others that charts use
  gc_percent: ['GC content (%)'],
  genome_size: ['Genome size'],
  genus: ['Genus'],
  superkingdom: ['Superkingdom'],
  tax_name: ['Specie', 'Species'],
  assembly: ['Assembly'],
};

/** Find the column actually present in `cols` given a desired dbName. */
function findColSmart(cols: string[], desiredDbName: string): string | null {
  const colsLower = cols.map(c => c.toLowerCase());
  const tryMatch = (candidate: string) => {
    const i = colsLower.indexOf(candidate.toLowerCase());
    return i >= 0 ? cols[i] : null;
  };

  // 1) exact dbName
  const byDb = tryMatch(desiredDbName);
  if (byDb) return byDb;

  // 2) by label from METADATA_COLUMNS
  const lbl = DB_TO_LABEL[desiredDbName.toLowerCase()];
  if (lbl) {
    const byLabel = tryMatch(lbl);
    if (byLabel) return byLabel;
  }

  // 3) by aliases (legacy db names or display labels)
  const aliases = COL_ALIASES[desiredDbName] ?? [];
  for (const a of aliases) {
    const hit = tryMatch(a);
    if (hit) return hit;
  }
  return null;
}

/** Find first present among multiple desired dbNames (e.g., new & legacy). */
function findFirstSmart(cols: string[], desiredDbNames: string[]): string | null {
  for (const d of desiredDbNames) {
    const hit = findColSmart(cols, d);
    if (hit) return hit;
  }
  return null;
}

// ---- dynamic bottom padding helper (for long/rotated labels)
function estimateBottomPadding(
  labels: string[],
  {
    min = 90,
    perChar = 3.5,
    max = 220,
  } = {}
) {
  const longest = labels.reduce((m, s) => Math.max(m, (s?.length ?? 0)), 0);
  return Math.min(max, Math.round(min + longest * perChar));
}

// ---------------- page ----------------

const VIZ_LIMIT = 5000;      // δείγμα για charts
const TOP_N_GENUS = 15;      // πόσα genus να δείχνει το bar

export default function MetadataPage() {
  // ------- Tabs -------
  const [tab, setTab] = useState(0);

  // 1) Superkingdom + Filter-on-taxonomy
  const [superkingdom, setSuperkingdom] = useState<string | null>(null);
  const [superkingdomOptions, setSuperkingdomOptions] = useState<string[]>([]);
  const [taxEnabled, setTaxEnabled] = useState(false);

  // 2) Basic taxonomy (ALWAYS fully initialized)
  const [basicTax, setBasicTax] = useState<{
    kingdom: string | null;
    phylum: string | null;
    class: string | null;
    order: string | null;
  }>({
    kingdom: null,
    phylum: null,
    class: null,
    order: null,
  });

  // 3) Advanced filters
  const [advOpen, setAdvOpen] = useState(false);
  const [rng, setRng] = useState<Ranges>({
    genome_size_min: '',
    genome_size_max: '',
    genome_size_ungapped_min: '',
    genome_size_ungapped_max: '',
    gc_percent_min: '',
    gc_percent_max: '',
  });
  const [exact, setExact] = useState({ assembly_eq: '', taxid_eq: '' });

  // Table + pagination
  const [rows, setRows] = useState<any[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [columnsVisible, setColumnsVisible] = useState<Record<string, boolean>>(() => {
    // Use labels from METADATA_COLUMNS as starting visibility map
    const v: Record<string, boolean> = {};
    METADATA_COLUMNS.forEach(col => { v[col.label] = !col.hidden; });
    return v;
  });
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  // Manual APPLY
  const [applyTick, setApplyTick] = useState(0);
  const apply = () => setApplyTick((x) => x + 1);

  // Viz data (separate fetch, same filters, big limit)
  const [vizRows, setVizRows] = useState<any[]>([]);
  const [vizCols, setVizCols] = useState<string[]>([]);
  const [vizLoading, setVizLoading] = useState(false);

  // Load superkingdom options once
  useEffect(() => {
    (async () => setSuperkingdomOptions(await distinct('superkingdom')))();
  }, []);

  // When superkingdom changes, reset dependent UI
  useEffect(() => {
    setTaxEnabled(false);
    setAdvOpen(false);
    setBasicTax({ kingdom: null, phylum: null, class: null, order: null });
    setOffset(0);
  }, [superkingdom]);

  // --- formatting μόνο για εμφάνιση: Z-DNA density με 2 δεκαδικά (new+old+label) ---
  const densityColKey = useMemo(
    () => findFirstSmart(cols, ['obs_density_per_kb', 'zdna_density']),
    [cols]
  );

  const assemblyColKey = useMemo(
    () => findColSmart(cols, 'assembly'),
    [cols]
  );

  const visibleCols = useMemo(() => cols.filter(c => columnsVisible[c] !== false), [cols, columnsVisible]);

  const displayRows = useMemo(() => {
    if (!densityColKey) return rows;
    return rows.map((r) => {
      const v = r[densityColKey];
      const num = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
      if (Number.isFinite(num)) return { ...r, [densityColKey]: num.toFixed(2) };
      return r;
    });
  }, [rows, densityColKey]);

  // ---- build ONLY filters (no limit/offset) ----
  const buildFilterParams = () => {
    const p = new URLSearchParams();
    if (taxEnabled) {
      p.set('filter_on_tax', '1');
      if (superkingdom) p.set('superkingdom', superkingdom);
      (['kingdom', 'phylum', 'class', 'order'] as const).forEach((k) => {
        const v = basicTax[k];
        if (v) p.set(k, String(v));
      });
      if (advOpen) {
        Object.entries(rng).forEach(([k, v]) => {
          if (typeof v === 'number' && Number.isFinite(v)) p.set(k, String(v));
        });
        Object.entries(exact).forEach(([k, v]) => v && p.set(k, String(v)));
      }
    }
    return p;
  };

  // Results params (with pagination)
  const paramsResults = useMemo(() => {
    const p = buildFilterParams();
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return p.toString();
  }, [taxEnabled, superkingdom, basicTax, advOpen, rng, exact, limit, offset]);

  // Viz params (big limit, offset 0)
  const paramsViz = useMemo(() => {
    const p = buildFilterParams();
    p.set('limit', String(VIZ_LIMIT));
    p.set('offset', '0');
    return p.toString();
  }, [taxEnabled, superkingdom, basicTax, advOpen, rng, exact, applyTick]);

  // Fetch data only on APPLY (and on paging/limit changes)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/metadata/list?${paramsResults}`);
        const j = await r.json();
        setRows(j.rows ?? []);
        setCols(j.columns ?? []); // may now be labels or dbNames
        setTotal(Number(j.total ?? 0));
      } catch (e) {
        console.error('[metadata] fetch failed', e);
        setRows([]); setCols([]); setTotal(0);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyTick, paramsResults]);

  // Fetch viz sample (independent from pagination; same filters; big limit)
  useEffect(() => {
    if (applyTick === 0) return; // wait until first APPLY
    let cancelled = false;
    (async () => {
      setVizLoading(true);
      try {
        const r = await fetch(`/api/metadata/list?${paramsViz}`);
        const j = await r.json();
        if (!cancelled) {
          setVizRows(j.rows ?? []);
          setVizCols(j.columns ?? []); // may now be labels or dbNames
        }
      } catch {
        if (!cancelled) { setVizRows([]); setVizCols([]); }
      } finally {
        if (!cancelled) setVizLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paramsViz, applyTick]);

  // Export
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const exportData = async (fmt: 'csv' | 'tsv' | 'json' | 'xml' | 'xlsx') => {
    const r = await fetch(`/api/metadata/export?fmt=${fmt}&${paramsResults}`);
    if (!r.ok) {
      console.error('export failed', r.status);
      setExportAnchor(null);
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metadata_export.${fmt === 'xlsx' ? 'xlsx' : fmt}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportAnchor(null);
  };

  // Reset page to defaults
  const resetAll = () => {
    setSuperkingdom(null);
    setTaxEnabled(false);
    setBasicTax({ kingdom: null, phylum: null, class: null, order: null });
    setAdvOpen(false);
    setRng({
      genome_size_min: '',
      genome_size_max: '',
      genome_size_ungapped_min: '',
      genome_size_ungapped_max: '',
      gc_percent_min: '',
      gc_percent_max: '',
    });
    setExact({ assembly_eq: '', taxid_eq: '' });
    setOffset(0);
    setLimit(25);
    setRows([]); setCols([]); setTotal(0);
    setVizRows([]); setVizCols([]);
    setApplyTick((x) => x + 1);
  };

  // Pagination handlers
  const page = Math.floor(offset / limit);
  const handlePageChange = (_: unknown, newPage: number) => {
    setOffset(newPage * limit);
    setApplyTick((x) => x + 1);
  };
  const handleRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLimit = parseInt(e.target.value, 10) || 25;
    setLimit(newLimit);
    setOffset(0);
    setApplyTick((x) => x + 1);
  };

  // ------------- VISUALIZATIONS (derive from vizRows + vizCols) -------------

  const colGenus = useMemo(() => findColSmart(vizCols, 'genus'), [vizCols]);
  const colGC = useMemo(() => findColSmart(vizCols, 'gc_percent'), [vizCols]);
  const colGSize = useMemo(() => findColSmart(vizCols, 'genome_size'), [vizCols]);
  const colSK = useMemo(() => findColSmart(vizCols, 'superkingdom'), [vizCols]);
  const colTaxName = useMemo(() => findColSmart(vizCols, 'tax_name'), [vizCols]);
  const colAssembly = useMemo(() => findColSmart(vizCols, 'assembly'), [vizCols]);

  // density column (support new+old db names and label)
  const vizDensityCol = useMemo(
    () => findFirstSmart(vizCols, ['obs_density_per_kb', 'zdna_density']),
    [vizCols]
  );

  // 1) Top Genera by avg Z-DNA density (bar)
  const genusBar = useMemo(() => {
    if (!vizDensityCol || !colGenus) return { cats: [] as string[], vals: [] as number[] };
    const agg = new Map<string, { sum: number; n: number }>();
    for (const r of vizRows) {
      const g = String(r[colGenus] ?? '').trim() || '(unknown)';
      const d = Number(r[vizDensityCol]);
      if (!Number.isFinite(d)) continue;
      const a = agg.get(g) ?? { sum: 0, n: 0 };
      a.sum += d; a.n += 1;
      agg.set(g, a);
    }
    const rowsAgg = Array.from(agg.entries()).map(([g, a]) => ({ g, avg: a.sum / Math.max(1, a.n) }));
    rowsAgg.sort((a, b) => b.avg - a.avg);
    const top = rowsAgg.slice(0, TOP_N_GENUS);
    return { cats: top.map(x => x.g), vals: top.map(x => Number(x.avg.toFixed(2))) };
  }, [vizRows, vizDensityCol, colGenus]);

  const genusBarOption = useMemo(() => ({
    title: { text: 'Top Genera by avg Z-DNA density (/kb)', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: genusBar.cats,
      axisLabel: { rotate: 35, margin: 16 },
      name: 'Genus',
      nameLocation: 'middle',
      nameGap: 80,
    },
    yAxis: {
      type: 'value',
      name: 'avg density (/kb)',
      nameLocation: 'middle',
      nameGap: 45,
      axisLabel: { margin: 12 },
    },
    series: [{
    type: 'bar',
    data: genusBar.vals,
    // προαιρετικά “κλειδώνουμε” την πρώτη απόχρωση για ομοιομορφία
    itemStyle: { color: CHART_PALETTES.genusBar[0] }
    }],
    grid: { left: 60, right: 20, top: 50, bottom: 90 }
  }), [genusBar]);

  // 2) Scatter: GC% vs Z-DNA density, bubble ~ genome_size, color = superkingdom
  const scatterData = useMemo(() => {
    if (!vizDensityCol || !colGC) return [];
    const pts: { gc: number; den: number; size: number; sk: string; label: string }[] = [];
    for (const r of vizRows) {
      const gc = Number(r[colGC]);
      const den = Number(r[vizDensityCol]);
      if (!Number.isFinite(gc) || !Number.isFinite(den)) continue;
      const size = colGSize ? Number(r[colGSize]) : NaN;
      const sk = colSK ? String(r[colSK] ?? '') : '';
      const label = colAssembly ? String(r[colAssembly] ?? '') : (colTaxName ? String(r[colTaxName] ?? '') : '');
      pts.push({ gc, den, size, sk, label });
    }
    return pts;
  }, [vizRows, vizDensityCol, colGC, colGSize, colSK, colTaxName, colAssembly]);

  const bubbleSizer = useMemo(() => makeBubbleSizer(scatterData.map((p) => p.size)), [scatterData]);

  const skCats = useMemo(() => {
    const s = new Set<string>(); scatterData.forEach(p => s.add(p.sk || '(NA)'));
    return Array.from(s);
  }, [scatterData]);

  const scatterSeries = useMemo(() => {
    const by = new Map<string, { value: number[]; name: string; label: { show: boolean } }[]>();
    for (const p of scatterData) {
      const k = p.sk || '(NA)';
      const arr = by.get(k) ?? [];
      arr.push({
        value: [p.gc, p.den, p.size],
        name: p.label,
        label: { show: false }
      });
      by.set(k, arr);
    }
    return skCats.map((k) => ({
      name: k,
      type: 'scatter',
      data: by.get(k) ?? [],
      symbolSize: (val: any[]) => bubbleSizer(Number(val?.[2] ?? NaN)),
      emphasis: { focus: 'series' },
    }));
  }, [scatterData, skCats, bubbleSizer]);

  const scatterOption = useMemo(() => ({
    color: CHART_PALETTES.scatter,
    title: { text: 'GC% vs Z-DNA density (/kb)', left: 'center' },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const [gc, den, sz] = p.value || [];
        return `${p.seriesName}<br/>GC%: ${gc?.toFixed?.(2)}<br/>Z-DNA density (/kb): ${den?.toFixed?.(2)}${Number.isFinite(sz) ? `<br/>Genome size: ${Math.round(sz)}` : ''}`;
      }
    },
    legend: { top: 28 },
    xAxis: {
      type: 'value',
      name: 'GC %',
      nameLocation: 'middle',
      nameGap: 45,
      axisLabel: { margin: 12 },
    },
    yAxis: {
      type: 'value',
      name: 'Z-DNA density (/kb)',
      nameLocation: 'middle',
      nameGap: 45,
      axisLabel: { margin: 12 },
    },
    series: scatterSeries,
    grid: { left: 70, right: 20, top: 70, bottom: 60 }
  }), [scatterSeries]);

  // 3) Genome size histogram
  const colGSizeLbl = useMemo(() => findColSmart(vizCols, 'genome_size'), [vizCols]);
  const histGenome = useMemo(() => {
    if (!colGSizeLbl) return { labels: [], counts: [] };
    return buildHistogram(vizRows.map(r => Number(r[colGSizeLbl])));
  }, [vizRows, colGSizeLbl]);

  const histGenomeOption = useMemo(() => {
    const bottomPad = estimateBottomPadding(histGenome.labels);
    return {
      color: CHART_PALETTES.histGenome,
      title: { text: 'Genome Size distribution', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: histGenome.labels,
        axisLabel: {
          interval: 0,
          rotate: 35,
          margin: 18,
          width: 100,
          overflow: 'break',
          lineHeight: 14,
        },
        name: 'Genome size',
        nameLocation: 'middle',
        nameGap: 90,
      },
      yAxis: {
        type: 'value',
        name: 'Count',
        nameLocation: 'middle',
        nameGap: 45,
        axisLabel: { margin: 12 },
      },
      series: [{ type: 'bar', data: histGenome.counts }],
      grid: { left: 60, right: 20, top: 50, bottom: bottomPad },
    } as echarts.EChartsOption;
  }, [histGenome]);

  // 4) GC% histogram
  const histGC = useMemo(() => {
    const c = colGC;
    if (!c) return { labels: [], counts: [] };
    return buildHistogram(vizRows.map(r => Number(r[c])));
  }, [vizRows, colGC]);

  const histGCOption = useMemo(() => {
    const bottomPad = estimateBottomPadding(histGC.labels);
    return {
      color: CHART_PALETTES.histGC,
      title: { text: 'GC% distribution', left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: histGC.labels,
        axisLabel: {
          interval: 0,
          rotate: 45,
          margin: 18,
          width: 90,
          overflow: 'break',
          lineHeight: 14,
        },
        name: 'GC %',
        nameLocation: 'middle',
        nameGap: 60,
      },
      yAxis: {
        type: 'value',
        name: 'Count',
        nameLocation: 'middle',
        nameGap: 45,
        axisLabel: { margin: 12 },
      },
      series: [{ type: 'bar', data: histGC.counts }],
      grid: { left: 60, right: 20, top: 50, bottom: bottomPad },
    } as echarts.EChartsOption;
  }, [histGC]);

  // Συνάρτηση για κεφαλαίο το πρώτο γράμμα και αντικατάσταση των κάτω παυλών με κενά
  const capitalize = (str: string) => {
    if (!str) return str;
    const s = String(str).replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const reorderedColumns = useMemo(() => {
    // both labels or dbNames can arrive in `cols`, so use smart matching
    const asmKey = assemblyColKey;
    const taxKey = findColSmart(cols, 'tax_name');
    if (!asmKey || !taxKey) return visibleCols;
    const otherCols = visibleCols.filter(c => c !== asmKey && c !== taxKey);
    return [asmKey, taxKey, ...otherCols];
  }, [visibleCols, assemblyColKey, cols]);

  // ---------------- render ----------------
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);

  const syncScroll = (source: HTMLElement, target: HTMLElement | null) => {
    if (!source || !target) return;
    target.scrollLeft = source.scrollLeft;
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Species browser</Typography>

      {/* TOP BAR */}
      <Paper
        elevation={1}
        sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" sx={{ minWidth: 110, textAlign: 'right' }}>
            Superkingdom
          </Typography>
          <Autocomplete
            options={superkingdomOptions}
            value={superkingdom}
            onChange={(_, v) => setSuperkingdom(v)}
            renderInput={(p) => (
              <TextField
                {...p}
                size="small"
                placeholder="Select superkingdom"
                sx={{ width: 260 }}
                autoComplete="off"
              />
            )}
          />
        </Box>

        <Button
          variant={taxEnabled ? 'contained' : 'outlined'}
          disabled={!superkingdom || taxEnabled}
          onClick={() => setTaxEnabled(true)}
        >
          Filter on taxonomy
        </Button>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <Button variant="contained" onClick={apply}>APPLY</Button>
        <Button variant="outlined" onClick={resetAll}>RESET</Button>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <IconButton color="primary" onClick={(e) => setExportAnchor(e.currentTarget)}>
          <DownloadIcon />
        </IconButton>
        <Menu
          open={Boolean(exportAnchor)}
          anchorEl={exportAnchor}
          onClose={() => setExportAnchor(null)}
        >
          <MenuItem onClick={() => exportData('csv')}>Export CSV</MenuItem>
          <MenuItem onClick={() => exportData('tsv')}>Export TSV</MenuItem>
          <MenuItem onClick={() => exportData('json')}>Export JSON</MenuItem>
          <MenuItem onClick={() => exportData('xml')}>Export XML</MenuItem>
          <MenuItem onClick={() => exportData('xlsx')}>Export Excel (.xlsx)</MenuItem>
        </Menu>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
        <ColumnVisibilityMenu columns={cols} visibility={columnsVisible} onChange={setColumnsVisible} />
      </Paper>

      {/* BASIC TAXONOMY */}
      <Collapse in={taxEnabled} mountOnEnter unmountOnExit>
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
          <BasicTaxonomy
            superkingdom={superkingdom || ''}
            value={basicTax}
            onChange={setBasicTax}
          />
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={advOpen} onChange={(_, v) => setAdvOpen(v)} />}
              label="Advanced filters"
            />
          </Box>
        </Paper>
      </Collapse>

      {/* ADVANCED */}
      <Collapse in={taxEnabled && advOpen} mountOnEnter unmountOnExit>
        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(280px, 1fr))',
                md: 'repeat(4, minmax(220px, 1fr))',
              },
              gap: 2,
            }}
          >
            <RangeFilter
              label="Genome Size"
              min={rng.genome_size_min}
              max={rng.genome_size_max}
              onMinChange={(v) => setRng((s) => ({ ...s, genome_size_min: v })) }
              onMaxChange={(v) => setRng((s) => ({ ...s, genome_size_max: v })) }
            />
            <RangeFilter
              label="Genome Size (Ungapped)"
              min={rng.genome_size_ungapped_min}
              max={rng.genome_size_ungapped_max}
              onMinChange={(v) => setRng((s) => ({ ...s, genome_size_ungapped_min: v })) }
              onMaxChange={(v) => setRng((s) => ({ ...s, genome_size_ungapped_max: v })) }
            />
            <RangeFilter
              label="GC Percent"
              min={rng.gc_percent_min}
              max={rng.gc_percent_max}
              onMinChange={(v) => setRng((s) => ({ ...s, gc_percent_min: v })) }
              onMaxChange={(v) => setRng((s) => ({ ...s, gc_percent_max: v })) }
            />
            <Box sx={{ display: 'grid', rowGap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ minWidth: 110, textAlign: 'right' }}>
                  Assembly
                </Typography>
                <TextField
                  size="small"
                  value={exact.assembly_eq}
                  onChange={(e) => setExact((s) => ({ ...s, assembly_eq: e.target.value })) }
                  sx={{ width: 240 }}
                  autoComplete="off"
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" sx={{ minWidth: 110, textAlign: 'right' }}>
                  Taxid
                </Typography>
                <TextField
                  size="small"
                  value={exact.taxid_eq}
                  onChange={(e) => setExact((s) => ({ ...s, taxid_eq: e.target.value })) }
                  sx={{ width: 240 }}
                  autoComplete="off"
                />
              </Box>
            </Box>
          </Box>
        </Paper>
      </Collapse>

      {/* RESULTS & VISUALIZATIONS TABS */}
      <Paper elevation={1} sx={{ p: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Results" />
          <Tab label="Visualizations" />
        </Tabs>

        {/* RESULTS TAB */}
        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            {loading ? (
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <TablePagination
                    component="div"
                    count={total}
                    page={page}
                    onPageChange={handlePageChange}
                    rowsPerPage={limit}
                    onRowsPerPageChange={handleRowsPerPage}
                    rowsPerPageOptions={[25, 50, 100]}
                  />
                </Box>

                {/* RESULTS TABLE with synced scrollbars */}
                <Box>
                  <Box
                    ref={topScrollRef}
                    sx={{
                      overflowX: "auto",
                      height: 16,
                      '&::-webkit-scrollbar': { height: 16, backgroundColor: '#f5f5f5' },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: '#bdbdbd',
                        borderRadius: 8,
                        backgroundClip: 'padding-box',
                        border: '4px solid transparent',
                      },
                      '&::-webkit-scrollbar-track': { backgroundColor: '#f5f5f5' }
                    }}
                    onScroll={(e) => syncScroll(e.currentTarget, bottomScrollRef.current)}
                  >
                    <div style={{ width: '150%', height: '1px', visibility: 'hidden' }} />
                  </Box>

                  <TableContainer
                    ref={bottomScrollRef}
                    sx={{
                      width: '100%',
                      overflowX: 'auto',
                      '&::-webkit-scrollbar': { height: 16, backgroundColor: '#f5f5f5' },
                      '&::-webkit-scrollbar-thumb': {
                        backgroundColor: '#bdbdbd',
                        borderRadius: 8,
                        backgroundClip: 'padding-box',
                        border: '4px solid transparent',
                      },
                      '&::-webkit-scrollbar-track': { backgroundColor: '#f5f5f5' }
                    }}
                    onScroll={(e) => syncScroll(e.currentTarget, topScrollRef.current)}
                  >
                    <Table size="small" sx={{ width: 'max-content', minWidth: '150%' }}>
                      <TableHead>
                        <TableRow>
                          {reorderedColumns.map((c) => (
                            <TableCell key={c}>
                              {c.toLowerCase() === 'tax_name' || c === DB_TO_LABEL['tax_name']
                                ? 'Species'
                                : capitalize(c)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {displayRows.map((row, i) => (
                          <TableRow key={row.id ?? `${page}-${i}`}>
                            {reorderedColumns.map((colKey) => {
                              const val = row[colKey];
                              if (assemblyColKey && colKey === assemblyColKey) {
                                const asm = String(val ?? '');
                                return (
                                  <TableCell key={colKey}>
                                    {asm ? (
                                      <Link
                                        component={RouterLink}
                                        to={`/explore?assembly=${encodeURIComponent(asm)}`}
                                        underline="hover"
                                        sx={{ cursor: 'pointer' }}
                                      >
                                        {asm}
                                      </Link>
                                    ) : ('')}
                                  </TableCell>
                                );
                              }
                              return <TableCell key={colKey}>{String(val ?? '')}</TableCell>;
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>

                <TablePagination
                  component="div"
                  count={total}
                  page={page}
                  onPageChange={handlePageChange}
                  rowsPerPage={limit}
                  onRowsPerPageChange={handleRowsPerPage}
                  rowsPerPageOptions={[25, 50, 100]}
                />
              </>
            )}
          </Box>
        )}

        {/* VISUALIZATIONS TAB */}
        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            {applyTick === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Set filters and press APPLY to render charts.
                </Typography>
              </Box>
            ) : vizLoading ? (
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            ) : vizRows.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  No data for current filters.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                {/* 1) Top Genera by avg density */}
                <Paper variant="outlined" sx={{ p: 1 }}>
                  {genusBar.cats.length > 0 ? (
                    <ReactECharts option={genusBarOption} style={{ height: 400 }} />
                  ) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Not enough data (need columns: genus/Genus, obs_density_per_kb or zdna_density).
                      </Typography>
                    </Box>
                  )}
                </Paper>

                {/* 2) Scatter GC% vs density */}
                <Paper variant="outlined" sx={{ p: 1 }}>
                  {scatterSeries.length > 0 ? (
                    <ReactECharts option={scatterOption} style={{ height: 400 }} />
                  ) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Not enough data (need columns: gc_percent/GC content (%), obs_density_per_kb or zdna_density).
                      </Typography>
                    </Box>
                  )}
                </Paper>

                {/* 3) Genome size histogram */}
                <Paper variant="outlined" sx={{ p: 1 }}>
                  {histGenome.labels.length > 0 ? (
                    <ReactECharts option={histGenomeOption} style={{ height: 400 }} />
                  ) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Not enough data (need column: genome_size/Genome size).
                      </Typography>
                    </Box>
                  )}
                </Paper>

                {/* 4) GC% histogram */}
                <Paper variant="outlined" sx={{ p: 1 }}>
                  {histGC.labels.length > 0 ? (
                    <ReactECharts option={histGCOption} style={{ height: 400 }} />
                  ) : (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Not enough data (need column: gc_percent/GC content (%)).
                      </Typography>
                    </Box>
                  )}
                </Paper>
              </Box>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
