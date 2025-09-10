import { useEffect, useMemo, useState } from 'react';
import ChromosomeAutocomplete from '../components/ChromosomeAutocomplete';
import AssemblyAutocomplete from '../components/AssemblyAutocomplete';

import ReactECharts from 'echarts-for-react';

import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tabs,
  Tab,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';

type Row = Record<string, any>;

// ---- Σταθερές / κλειδιά πεδίων ----
const SCORE_KEY = 'Z-DNA Score';

// Βασικές στήλες πίνακα
const BASE_COLS = [
  { key: 'chrom', label: 'Chromosome', api: 'Chromosome', numeric: false },
  { key: 'start', label: 'Start', api: 'Start', numeric: true },
  { key: 'end', label: 'End', api: 'End', numeric: true },
  { key: 'score', label: 'Z‑DNA Score', api: SCORE_KEY, numeric: true },
  { key: 'seq', label: 'Sequence', api: 'Sequence', numeric: false },
] as const;

// Προαιρετική στήλη Assembly (αν επιστρέφεται από backend)
const ASM_COL = { key: 'assembly', label: 'Assembly', api: 'assembly', numeric: false } as const;

type SortKey = 'chrom' | 'start' | 'end' | 'score' | 'assembly' | 'none';

// Δείγμα σειρών για Visualizations (όχι όλο το σύνολο, για ταχύτητα)
const VIZ_LIMIT = 5000;

// ---------------- Component ----------------
export default function Explorer() {
  // -------- Tabs --------
  const [tab, setTab] = useState(0);

  // -------- Filters --------
  const [chr, setChr] = useState<string>('');
  const [startText, setStartText] = useState<string>('');
  const [endText, setEndText] = useState<string>('');
  // Z‑DNA Score σε 2 inputs (≥ και ≤)
  const [scoreMinText, setScoreMinText] = useState<string>('');
  const [scoreMaxText, setScoreMaxText] = useState<string>('');
  const [seq, setSeq] = useState<string>('');
  const [assemblyEq, setAssemblyEq] = useState<string>(''); // exact assembly
  // re‑mount token για να καθαρίζουν τα Autocomplete στο RESET
  const [resetToken, setResetToken] = useState<number>(0);

  // -------- Results / state --------
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  // pagination
  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState<number>(0);
  const page = Math.floor(offset / limit);
  const onPageChange = (_: unknown, newPage: number) => setOffset(newPage * limit);
  const onRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newLimit = parseInt(e.target.value, 10) || 25;
    setLimit(newLimit);
    setOffset(0);
  };

  // total rows (auto-count)
  const [total, setTotal] = useState<number>(0);
  const [counting, setCounting] = useState<boolean>(false);

  // sorting (local)
  const [sortKey, setSortKey] = useState<SortKey>('none');
  const [order, setOrder] = useState<'ASC' | 'DESC'>('ASC');

  // explicit APPLY
  const [hasApplied, setHasApplied] = useState(false);
  const [applyTick, setApplyTick] = useState(0);

  // export menu
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);

  // --- Visualizations state (φέρνουμε δείγμα ίδιων φιλτραρισμένων rows) ---
  const [vizRows, setVizRows] = useState<Row[]>([]);
  const [vizLoading, setVizLoading] = useState(false);

  // Έλεγχος αν υπάρχουν φίλτρα
  const canApply =
    chr.trim() !== '' ||
    !!startText ||
    !!endText ||
    !!scoreMinText ||
    !!scoreMaxText ||
    seq.trim() !== '' ||
    assemblyEq.trim() !== '';

  // --- APPLY: φέρνουμε rows (fast) + τρέχουμε αυτόματα count & viz sample ---
  const onApply = () => {
    if (!canApply) return;
    setHasApplied(true);
    setOffset(0);
    setTotal(0);
    setCounting(true);
    setApplyTick((v) => v + 1);
  };

  const onReset = () => {
    setChr('');
    setStartText('');
    setEndText('');
    setScoreMinText('');
    setScoreMaxText('');
    setSeq('');
    setAssemblyEq('');
    setRows([]);
    setColumns([]);
    setVizRows([]);
    setOffset(0);
    setTotal(0);
    setSortKey('none');
    setOrder('ASC');
    setHasApplied(false);
    setCounting(false);
    setResetToken((t) => t + 1); // << re-mount τα autocomplete ώστε να αδειάσουν οπτικά
  };

  // dynamic columns (πρόσθεσε assembly αν επιστρέφεται)
  const showAssembly = useMemo(
    () => columns.some((c) => c.toLowerCase() === 'assembly') || rows.some((r) => 'assembly' in r),
    [columns, rows]
  );
  const COLS = useMemo(() => (showAssembly ? [...BASE_COLS, ASM_COL] : BASE_COLS), [showAssembly]);

  // Build filters (shared για search, export, viz)
  const buildFilterParams = () => {
    const sp = new URLSearchParams();

    const chrTrim = chr.trim();
    if (chrTrim) sp.set('chr', chrTrim);

    const s = parseFloat(startText);
    if (!Number.isNaN(s)) sp.set('start_gte', String(s));
    const e = parseFloat(endText);
    if (!Number.isNaN(e)) sp.set('end_lte', String(e));

    // score_min / score_max από τα inputs
    const smin = parseFloat(scoreMinText);
    if (!Number.isNaN(smin)) sp.set('score_min', String(smin));
    const smax = parseFloat(scoreMaxText);
    if (!Number.isNaN(smax)) sp.set('score_max', String(smax));

    if (seq.trim()) sp.set('seq', seq.trim());
    if (assemblyEq.trim()) sp.set('assembly_eq', assemblyEq.trim());

    return sp;
  };

  // ---------------- Fetch rows (fast=1) ----------------
  useEffect(() => {
    if (!hasApplied) return;

    let cancelled = false;
    (async () => {
      setLoadingRows(true);
      try {
        const sp = buildFilterParams();
        sp.set('limit', String(limit));
        sp.set('offset', String(offset));
        sp.set('fast', '1'); // rows γρήγορα

        const r = await fetch(`/api/zdna/search?${sp.toString()}`);
        const j = await r.json();
        if (!cancelled) {
          setRows(Array.isArray(j?.rows) ? j.rows : []);
          setColumns(Array.isArray(j?.columns) ? j.columns : []);
        }
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // rows αλλάζουν με applyTick/limit/offset
  }, [hasApplied, applyTick, limit, offset]);

  // ---------------- Fetch count (fast=0, limit=0) ----------------
  useEffect(() => {
    if (!hasApplied) return;

    let cancelled = false;
    (async () => {
      setCounting(true);
      try {
        const sp = buildFilterParams();
        sp.set('limit', '0');
        sp.set('offset', '0');
        sp.set('fast', '0'); // ζήτησε COUNT

        const r = await fetch(`/api/zdna/search?${sp.toString()}`);
        const j = await r.json();
        if (!cancelled && typeof j?.total === 'number' && j.total >= 0) {
          setTotal(j.total);
        }
      } catch {
        /* no-op */
      } finally {
        if (!cancelled) setCounting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // count μόνο όταν αλλάζουν φίλτρα (applyTick)
  }, [hasApplied, applyTick]);

  // ---------------- Fetch viz sample (fast=1, limit=VIZ_LIMIT) ----------------
  useEffect(() => {
    if (!hasApplied) return;

    let cancelled = false;
    (async () => {
      setVizLoading(true);
      try {
        const sp = buildFilterParams();
        sp.set('limit', String(VIZ_LIMIT));
        sp.set('offset', '0');
        sp.set('fast', '1'); // δείγμα γρήγορα

        const r = await fetch(`/api/zdna/search?${sp.toString()}`);
        const j = await r.json();
        if (!cancelled) {
          setVizRows(Array.isArray(j?.rows) ? j.rows : []);
        }
      } catch {
        if (!cancelled) setVizRows([]);
      } finally {
        if (!cancelled) setVizLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasApplied, applyTick]);

  // sorting (local για τον πίνακα)
  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) setOrder((o) => (o === 'ASC' ? 'DESC' : 'ASC'));
    else {
      setSortKey(key);
      setOrder('ASC');
    }
  };

  const sortedRows = useMemo(() => {
    if (sortKey === 'none') return rows;
    const col = COLS.find((c) => c.key === sortKey);
    if (!col) return rows.slice();

    const dir = order === 'ASC' ? 1 : -1;
    const arr = rows.slice();

    arr.sort((a, b) => {
      const av = a[col.api], bv = b[col.api];
      if (col.numeric) {
        const an = Number(av), bn = Number(bv);
        if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
        if (Number.isNaN(an)) return -dir;
        if (Number.isNaN(bn)) return dir;
        return an < bn ? -dir : an > bn ? dir : 0;
      }
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
    return arr;
  }, [rows, COLS, sortKey, order]);

  // -------- Export (menu) --------
  const exportData = async (fmt: 'csv' | 'tsv' | 'json' | 'xml' | 'xlsx') => {
    const sp = buildFilterParams();
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));
    sp.set('fmt', fmt);

    try {
      const r = await fetch(`/api/zdna/export?${sp.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ext = fmt === 'xlsx' ? 'xlsx' : fmt;
      a.href = url;
      a.download = `zdna_export.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[explorer] export failed', e);
    } finally {
      setExportAnchor(null);
    }
  };

  // =========================
  // ====== Visualizations ===
  // =========================

  // Defensive helpers
  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  // 1) Scatter/Manhattan: Start vs Score
  const manhattanData = useMemo(() => {
    const pts: [number, number][] = [];
    for (const r of vizRows) {
      const x = toNum(r['Start']); // ή mid-point
      const y = toNum(r[SCORE_KEY]);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
    }
    return pts.sort((a, b) => a[0] - b[0]);
  }, [vizRows]);

  const manhattanOption = useMemo(() => {
    return {
      title: { text: 'Z‑DNA Score vs Genomic Position', left: 'center' },
      tooltip: { trigger: 'item', formatter: (p: any) => `Start: ${p.value[0]}<br/>Score: ${p.value[1]}` },
      xAxis: { type: 'value', name: 'Start' },
      yAxis: { type: 'value', name: 'Score' },
      series: [{
        name: 'Score',
        type: 'scatter',
        symbolSize: 6,
        data: manhattanData,
        large: true,
      }],
      grid: { left: 60, right: 20, top: 50, bottom: 50 }
    };
  }, [manhattanData]);

  // 2) Histogram score
  const scoreHist = useMemo(() => {
    const values: number[] = [];
    for (const r of vizRows) {
      const s = toNum(r[SCORE_KEY]);
      if (Number.isFinite(s)) values.push(s);
    }
    if (values.length === 0) return { bins: [], counts: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = 20;
    const width = (max - min) > 0 ? (max - min) / binCount : 1;
    const bins = Array.from({ length: binCount }, (_, i) => min + i * width);
    const counts = new Array(binCount).fill(0);
    for (const v of values) {
      const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / width)));
      counts[idx]++;
    }
    const labels = bins.map((b, i) => `${b.toFixed(1)} – ${(b + width).toFixed(1)}`);
    return { bins: labels, counts };
  }, [vizRows]);

  const scoreHistOption = useMemo(() => ({
    title: { text: 'Score Histogram', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: scoreHist.bins, axisLabel: { rotate: 45 } },
    yAxis: { type: 'value', name: 'Count' },
    series: [{ type: 'bar', data: scoreHist.counts }],
    grid: { left: 60, right: 20, top: 50, bottom: 80 }
  }), [scoreHist]);

  // 3) Heatmap: Position bins × Score bins
  const heatmap = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const pts: { x: number; y: number }[] = [];
    for (const r of vizRows) {
      const x = toNum(r['Start']);
      const y = toNum(r[SCORE_KEY]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x); ys.push(y); pts.push({ x, y });
      }
    }
    if (pts.length === 0) return { xLabels: [], yLabels: [], data: [] as any[] };

    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const xrange = Math.max(1, xmax - xmin);
    const xBins = Math.min(50, Math.max(5, Math.floor(xrange / 10000))); // δυναμικός αριθμός bins
    const xw = xrange / xBins;

    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const yBins = 20;
    const yw = (ymax - ymin || 1) / yBins;

    const counts = Array.from({ length: yBins }, () => new Array(xBins).fill(0));
    for (const p of pts) {
      const xi = Math.min(xBins - 1, Math.max(0, Math.floor((p.x - xmin) / xw)));
      const yi = Math.min(yBins - 1, Math.max(0, Math.floor((p.y - ymin) / yw)));
      counts[yi][xi]++;
    }

    const xLabels = Array.from({ length: xBins }, (_, i) => Math.round(xmin + i * xw));
    const yLabels = Array.from({ length: yBins }, (_, i) => (ymin + i * yw).toFixed(1));

    const data: [number, number, number][] = [];
    for (let yi = 0; yi < yBins; yi++) {
      for (let xi = 0; xi < xBins; xi++) data.push([xi, yi, counts[yi][xi]]);
    }
    return { xLabels, yLabels, data };
  }, [vizRows]);

  const heatmapOption = useMemo(() => ({
    title: { text: 'Density Heatmap (Position × Score)', left: 'center' },
    tooltip: { position: 'top' },
    xAxis: { type: 'category', data: heatmap.xLabels, name: 'Start (bin)', axisLabel: { hideOverlap: true } },
    yAxis: { type: 'category', data: heatmap.yLabels, name: 'Score (bin)' },
    visualMap: { min: 0, max: Math.max(1, ...heatmap.data.map(d => d[2])), orient: 'horizontal', left: 'center', bottom: 0 },
    series: [{ type: 'heatmap', data: heatmap.data }],
    grid: { left: 60, right: 30, top: 50, bottom: 60 }
  }), [heatmap]);

  // 4) Length histogram (End-Start+1)
  const lenHist = useMemo(() => {
    const lens: number[] = [];
    for (const r of vizRows) {
      const s = toNum(r['Start']);
      const e = toNum(r['End']);
      if (Number.isFinite(s) && Number.isFinite(e) && e >= s) lens.push(e - s + 1);
    }
    if (lens.length === 0) return { bins: [], counts: [] };
    const min = Math.min(...lens), max = Math.max(...lens);
    const binCount = 20;
    const width = (max - min) > 0 ? (max - min) / binCount : 1;
    const bins = Array.from({ length: binCount }, (_, i) => min + i * width);
    const counts = new Array(binCount).fill(0);
    for (const v of lens) {
      const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - min) / width)));
      counts[idx]++;
    }
    const labels = bins.map((b, i) => `${Math.round(b)}–${Math.round(b + width)}`);
    return { bins: labels, counts };
  }, [vizRows]);

  const lenHistOption = useMemo(() => ({
    title: { text: 'Length Histogram (End‑Start+1)', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: lenHist.bins, axisLabel: { rotate: 45 } },
    yAxis: { type: 'value', name: 'Count' },
    series: [{ type: 'bar', data: lenHist.counts }],
    grid: { left: 60, right: 20, top: 50, bottom: 80 }
  }), [lenHist]);

  // (Προαιρετικό) 5) k‑mer bar chart (3‑mers) — μπορεί να προστεθεί εύκολα:
  // const kmerOption = useMemo(() => { ... }, [vizRows]);

  // ---------------- Render ----------------
  return (
    <Box sx={{ p: 2 }}>
      {/* FILTER BAR */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Toolbar disableGutters sx={{ gap: 2, flexWrap: 'wrap' }}>
          {/* Chromosome (Autocomplete, επηρεάζεται από Assembly) */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 92 }}>Chromosome</Typography>
            <Box sx={{ width: 240 }}>
              <ChromosomeAutocomplete
                key={`chr-${resetToken}`}
                value={chr}
                onChange={(v) => setChr((v || '').trim())}
                assemblyEq={assemblyEq}
                label=""
                placeholder="Type to search…"
                serverLimit={50}
                minServerChars={2}
              />
            </Box>
          </Box>

          {/* Start / End */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 36 }}>Start ≥</Typography>
            <TextField size="small" placeholder="Start" value={startText}
              onChange={(e) => setStartText(e.target.value)} sx={{ width: 120 }}
              inputProps={{ inputMode: 'numeric' }} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 32 }}>End ≤</Typography>
            <TextField size="small" placeholder="End" value={endText}
              onChange={(e) => setEndText(e.target.value)} sx={{ width: 120 }}
              inputProps={{ inputMode: 'numeric' }} />
          </Box>

          {/* Z‑DNA Score min/max */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 118 }}>Z‑DNA Score ≥</Typography>
            <TextField
              size="small"
              placeholder="Score min"
              value={scoreMinText}
              onChange={(e) => setScoreMinText(e.target.value)}
              sx={{ width: 120 }}
              inputProps={{ inputMode: 'decimal' }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 114 }}>Z‑DNA Score ≤</Typography>
            <TextField
              size="small"
              placeholder="Score max"
              value={scoreMaxText}
              onChange={(e) => setScoreMaxText(e.target.value)}
              sx={{ width: 120 }}
              inputProps={{ inputMode: 'decimal' }}
            />
          </Box>

          {/* Sequence contains */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 132 }}>Sequence contains</Typography>
            <TextField
              size="small"
              placeholder="Substring"
              value={seq}
              onChange={(e) => setSeq(e.target.value)}
              sx={{ width: 260 }}
            />
          </Box>

          {/* Assembly (Autocomplete) */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ minWidth: 78 }}>Assembly</Typography>
            <Box sx={{ width: 260 }}>
              <AssemblyAutocomplete
                key={`asm-${resetToken}`}
                value={assemblyEq}
                onChange={(v) => setAssemblyEq((v || '').trim())}
                label=""
                placeholder="e.g. GCA_000002515.1"
                limit={50}
              />
            </Box>
          </Box>

          {/* Actions */}
          <Button variant="contained" onClick={onApply} disabled={!canApply || loadingRows}>APPLY</Button>
          <Button variant="outlined" onClick={onReset} disabled={loadingRows}>RESET</Button>

          {/* Export menu (CSV/TSV/JSON/XML/XLSX) */}
          <IconButton color="primary" onClick={(e) => setExportAnchor(e.currentTarget)} disabled={loadingRows}>
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
        </Toolbar>
      </Paper>

      {/* TABS */}
      <Paper elevation={1} sx={{ p: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Results" />
          <Tab label="Visualizations" />
        </Tabs>

        {/* RESULTS TAB */}
        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            {/* TOP: Found + Pagination */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {hasApplied ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    Found: <strong>{total > 0 ? total.toLocaleString() : '—'}</strong>
                    {counting && <CircularProgress size={14} />}
                  </span>
                ) : (
                  'Set filters and press APPLY'
                )}
              </Typography>
              <TablePagination
                component="div"
                count={total > 0 ? total : 0}
                page={page}
                onPageChange={onPageChange}
                rowsPerPage={limit}
                onRowsPerPageChange={onRowsPerPageChange}
                rowsPerPageOptions={[25, 50, 100]}
              />
            </Box>

            {/* Results table */}
            <TableContainer component={Paper} variant="outlined">
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {COLS.map((c) => (
                      <TableCell key={c.key}>
                        <TableSortLabel
                          active={sortKey === c.key}
                          direction={sortKey === c.key ? (order.toLowerCase() as 'asc' | 'desc') : 'asc'}
                          onClick={() => handleSortClick(c.key as SortKey)}
                        >
                          {c.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedRows.map((r, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{r['Chromosome']}</TableCell>
                      <TableCell>{r['Start']}</TableCell>
                      <TableCell>{r['End']}</TableCell>
                      <TableCell>{r[SCORE_KEY]}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{r['Sequence']}</TableCell>
                      {showAssembly && <TableCell>{r['assembly']}</TableCell>}
                    </TableRow>
                  ))}
                  {sortedRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={COLS.length}>
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            {hasApplied ? 'No rows' : 'Press APPLY to run the search'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* BOTTOM pagination */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <TablePagination
                component="div"
                count={total > 0 ? total : 0}
                page={page}
                onPageChange={onPageChange}
                rowsPerPage={limit}
                onRowsPerPageChange={onRowsPerPageChange}
                rowsPerPageOptions={[25, 50, 100]}
              />
            </Box>
          </Box>
        )}

        {/* VISUALIZATIONS TAB */}
        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            {!hasApplied ? (
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
                <Paper variant="outlined" sx={{ p: 1 }}>
                  <ReactECharts option={manhattanOption} style={{ height: 320 }} />
                </Paper>
                <Paper variant="outlined" sx={{ p: 1 }}>
                  <ReactECharts option={scoreHistOption} style={{ height: 320 }} />
                </Paper>
                <Paper variant="outlined" sx={{ p: 1, gridColumn: { xs: 'auto', md: '1 / span 2' } }}>
                  <ReactECharts option={heatmapOption} style={{ height: 360 }} />
                </Paper>
                <Paper variant="outlined" sx={{ p: 1 }}>
                  <ReactECharts option={lenHistOption} style={{ height: 320 }} />
                </Paper>
                {/* Προαιρετικά:
                <Paper variant="outlined" sx={{ p: 1 }}>
                  <ReactECharts option={kmerOption} style={{ height: 320 }} />
                </Paper>
                */}
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* Loading overlay για rows (Results) */}
      <Backdrop open={loadingRows} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </Box>
  );
}
