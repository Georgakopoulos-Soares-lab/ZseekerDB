import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination,
  Tabs, Tab,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ReactECharts from 'echarts-for-react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';
import { VIZ_FONT, VIZ_MUI_FONT } from '../utils/visualizationTypography';
import { runSQL } from '../utils/sql';
import type { ChartParam } from '../utils/chartTypes';
import { COUNT_TICKS, LENGTH_TICKS, SCORE_TICKS, linearTicks, tickPosition, ticksUpTo } from '../utils/tickScale';

/* ------------------------------- Types/Helpers ------------------------------ */

type Row = {
  Chromosome: string;
  Start: number;
  End: number;
  Score: number;      // mapped from "Z-DNA Score"
  Sequence: string;
};

type KV = { label: string };

type ChrStat = {
  assembly: string;
  chr: string;
  n: number;
  score: number[];   // min, q1, median, q3, max
  length: number[];  // min, q1, median, q3, max
  scaffolds: number;
  gsize: number;
};
type Sample = { pos: number; len: number; score: number };
type VizData = {
  single: boolean;            // one chromosome (selected, or the only one)
  chromLen: number;           // single mode: extent used for the bins
  binSize: number;
  bins: number[];             // single mode: site counts per bin
  chrStats: ChrStat[];        // genome-wide mode, natural order (by site count if collapsed)
  hiddenChromosomes: number;  // chromosomes collapsed into the "…" bin
  scoreHist: { bin: number; n: number }[];
  lenHist: { bin: number; n: number }[];
  sample: Sample[];
};

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const AUTOCOMPLETE_LIMIT = 100;
const BATCH_EXPORT = 50_000;          // rows per export chunk
const MAX_EXPORT_ROWS = 1_000_000;    // safety cap for client export
const SCATTER_SAMPLE = 20_000;        // nominal sample size for scatter
const VIZ_BINS = 10;                  // bins along a single chromosome
const MAX_VIZ_CHROMOSOMES = 25;       // per-chromosome panels: all chromosomes up to this many,
const VIZ_CHROMOSOME_EDGE = 12;       // otherwise the top and lowest 12 by site count with a gap bin

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const fmtNum = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '');
const getVal = (o: unknown, k: string): unknown => {
  const r = (o ?? {}) as Record<string, unknown>;
  return r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()];
};
// Bin size with unit, e.g. 24.8 Mb / 3.2 kb / 512 bp.
const fmtBp = (bp: number) =>
  bp >= 1e6 ? `${+(bp / 1e6).toFixed(1)} Mb` : bp >= 1e3 ? `${+(bp / 1e3).toFixed(1)} kb` : `${Math.round(bp)} bp`;
const fmtMb = (mb: number) => `${+mb.toFixed(mb >= 10 ? 1 : 3)}`;

// Axis tick labels and titles don't inherit the global textStyle size in ECharts,
// so apply the plot font size to them unless a chart sets its own.
function withAxisFont(axis: unknown): unknown {
  const one = (a: unknown) => {
    if (!a || typeof a !== 'object') return a;
    const ax = a as Record<string, object | undefined>;
    return {
      ...ax,
      axisLabel: { fontSize: VIZ_FONT.base, ...(ax.axisLabel ?? {}) },
      nameTextStyle: { fontSize: VIZ_FONT.base, ...(ax.nameTextStyle ?? {}) },
    };
  };
  return Array.isArray(axis) ? axis.map(one) : one(axis);
}

function FullWidthChart({
  option,
  height = 400,
  deps = [],
}: {
  option: Record<string, unknown>;
  height?: number;
  deps?: unknown[];
}) {
  const ref = useRef<ReactECharts>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.getEchartsInstance()?.resize();
    }, 0);
    return () => clearTimeout(t);
    // Callers pass the values whose change should trigger a resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <ReactECharts
      ref={ref}
      option={{
        ...option,
        textStyle: {
          ...((option.textStyle ?? {}) as Record<string, unknown>),
          fontSize: VIZ_FONT.base,
        },
        xAxis: withAxisFont(option.xAxis),
        yAxis: withAxisFont(option.yAxis),
      }}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge={true}
      lazyUpdate={false}
    />
  );
}


/* -------------------------------- Exporters -------------------------------- */

function buildCsv(rows: Row[], sep = ',') {
  const head = ['Chromosome', 'Start', 'End', 'Z-DNA Score', 'Sequence'];
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [head.join(sep)];
  for (const r of rows) {
    lines.push([escape(r.Chromosome), r.Start, r.End, r.Score, escape(r.Sequence)].join(sep));
  }
  return lines.join('\n');
}
const buildJson = (rows: Row[]) => JSON.stringify(rows, null, 2);
function buildXml(rows: Row[]) {
  const esc = (s: unknown) =>
    String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const items = rows.map(r =>
    `<row><Chromosome>${esc(r.Chromosome)}</Chromosome><Start>${r.Start}</Start><End>${r.End}</End><ZDNA_Score>${r.Score}</ZDNA_Score><Sequence>${esc(r.Sequence)}</Sequence></row>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${items.join('\n')}\n</rows>\n`;
}
function buildExcelHtml(rows: Row[]) {
  const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const head = `<tr><th>Chromosome</th><th>Start</th><th>End</th><th>Z-DNA Score</th><th>Sequence</th></tr>`;
  const body = rows
    .map(r => `<tr><td>${esc(r.Chromosome)}</td><td>${r.Start}</td><td>${r.End}</td><td>${r.Score}</td><td>${esc(r.Sequence)}</td></tr>`)
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charSet="utf-8" /></head><body><table border="1">${head}${body}</table></body></html>`;
}
function downloadBlob(content: BlobPart | BlobPart[], filename: string, type: string) {
  const blob = new Blob(Array.isArray(content) ? content : [content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------------- Component -------------------------------- */

// Cache for species search results
const speciesSearchCache = new Map<string, KV[]>();

export default function Explorer() {

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const axisLabelColor = isDark ? '#ffffff' : '#666666';
  const axisNameColor  = isDark ? '#ffffff' : '#333333';

  const tooltipBg      = isDark ? 'rgba(0,0,0,0.85)' : '#ffffff';
  const tooltipText    = isDark ? '#ffffff' : '#000000';

  const [searchParams] = useSearchParams();
  const lockedAssemblyFromURL = searchParams.get('assembly');

  // Tabs
  const [tab, setTab] = useState<'results' | 'viz'>('results');

  // (optional) locked assembly via URL
  const [lockedAssembly, setLockedAssembly] = useState<string | null>(null);

  // species (optional if assembly locked)
  const [species, setSpecies] = useState<string | null>(null);
  const [speciesInput, setSpeciesInput] = useState('');
  const [speciesOpts, setSpeciesOpts] = useState<KV[]>([]);
  const [loadingSpecies, setLoadingSpecies] = useState(false);

  // chromosome (depends on species OR locked assembly)
  const [chr, setChr] = useState<string | null>(null);
  const [chrInput, setChrInput] = useState('');
  const [chrOpts, setChrOpts] = useState<KV[]>([]);
  const [loadingChr, setLoadingChr] = useState(false);

  // numeric / text filters
  const [startMin, setStartMin] = useState('');
  const [startMax, setStartMax] = useState('');
  const [endMin,   setEndMin]   = useState('');
  const [endMax,   setEndMax]   = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [contains, setContains] = useState('');

  // results + pagination
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rpp, setRpp] = useState(DEFAULT_PAGE_SIZE);

  // export menu
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const exportOpen = Boolean(exportAnchor);

  // lock assembly from URL on mount / when URL changes
  useEffect(() => {
    setLockedAssembly(lockedAssemblyFromURL);
    if (lockedAssemblyFromURL) {
      // requirement: default query when ?assembly=... => ILIKE '%A%', LIMIT 25, OFFSET 0 (no other filters)
      setSpecies(null);
      setChr(null); setChrInput('');
      setStartMin(''); setStartMax('');
      setEndMin('');   setEndMax('');
      setScoreMin(''); setScoreMax('');
      setContains('A');
      setPage(0);
      setRpp(DEFAULT_PAGE_SIZE);
    }
  }, [lockedAssemblyFromURL]);

  const hasQueryContext = Boolean(species) || Boolean(lockedAssembly);

  // Total predictions for the selected species / assembly (from metadata), so the
  // results table can say when there are none at all rather than "refine filters".
  const [contextPredictions, setContextPredictions] = useState<number | null>(null);
  useEffect(() => {
    if (!hasQueryContext) { setContextPredictions(null); return; }
    let dead = false;
    const where = lockedAssembly
      ? `assembly = ${q(lockedAssembly)}`
      : `genome_size_manual >= 1000 AND tax_name = ${q(species!)}`;
    runSQL<{ n: number }>(`SELECT COALESCE(SUM(obs_n_zdna), 0) AS n FROM metadata WHERE ${where}`)
      .then(r => { if (!dead) setContextPredictions(Number(r[0]?.n ?? 0)); })
      .catch(() => { if (!dead) setContextPredictions(null); });
    return () => { dead = true; };
  }, [hasQueryContext, lockedAssembly, species]);

  /* ---------------------------- Autocomplete: species ---------------------------- */
  // Debounce species input
  const debouncedSpeciesInput = useDebounce(speciesInput, 300);

  // Memoized species search function
  const searchSpecies = useCallback(async (prefix: string): Promise<KV[]> => {
    // Return empty array if input is too short
    if (prefix.length < 2) return [];

    // Check cache first
    const cacheKey = prefix.toLowerCase();
    if (speciesSearchCache.has(cacheKey)) {
      return speciesSearchCache.get(cacheKey)!;
    }

    // All species in the release metadata, including those without predictions
    const sql = `
      SELECT DISTINCT tax_name AS label 
      FROM metadata 
      WHERE genome_size_manual >= 1000 AND lower(tax_name) LIKE ${q(prefix.toLowerCase() + '%')} 
      ORDER BY 1 
      LIMIT ${AUTOCOMPLETE_LIMIT}
    `;

    const results = await runSQL<KV>(sql);
    speciesSearchCache.set(cacheKey, results);
    return results;
  }, []);

  // Species autocomplete effect
  useEffect(() => {
    let cancelled = false;

    const fetchSpecies = async () => {
      setLoadingSpecies(true);
      try {
        const prefix = debouncedSpeciesInput.trim();
        if (prefix.length < 2) {
          setSpeciesOpts([]);
          return;
        }

        const results = await searchSpecies(prefix);
        if (!cancelled) {
          setSpeciesOpts(results);
        }
      } finally {
        if (!cancelled) {
          setLoadingSpecies(false);
        }
      }
    };

    fetchSpecies();

    return () => {
      cancelled = true;
    };
  }, [debouncedSpeciesInput, searchSpecies]);

  /* -------------------------- Autocomplete: chromosome -------------------------- */
  useEffect(() => {
    if (!hasQueryContext) { setChrOpts([]); return; }
    let dead = false;
    (async () => {
      setLoadingChr(true);
      try {
        const prefix = chrInput.trim().toLowerCase();
        let where: string;

        if (lockedAssembly) {
          where = `assembly = ${q(lockedAssembly)}`;
        } else {
          where = `assembly IN (SELECT assembly FROM metadata WHERE genome_size_manual >= 1000 AND tax_name = ${q(species!)})`;
        }

        const andPrefix = prefix ? `AND lower("Chromosome") LIKE ${q(prefix + '%')}` : '';
        const sql = `
          SELECT DISTINCT "Chromosome" AS label
          FROM data
          WHERE ${where} ${andPrefix}
          LIMIT ${AUTOCOMPLETE_LIMIT}
        `;
        const opts = await runSQL<KV>(sql);
        
        // Apply natural sort to chromosome options
        const sorted = opts.sort((a, b) => naturalSort(a.label, b.label));
        
        if (!dead) setChrOpts(sorted);
      } finally {
        if (!dead) setLoadingChr(false);
      }
    })();
    return () => { dead = true; };
  }, [species, lockedAssembly, chrInput, hasQueryContext]);

  /* -------------------------------- WHERE builder ------------------------------- */
  const whereSql = useMemo(() => {
    const parts: string[] = [];
    if (!species && !lockedAssembly) return '1=0';

    if (species)        parts.push(`assembly IN (SELECT assembly FROM metadata WHERE genome_size_manual >= 1000 AND tax_name = ${q(species)})`);
    if (lockedAssembly) parts.push(`assembly = ${q(lockedAssembly)}`);

    if (chr) parts.push(`"Chromosome" = ${q(chr)}`);
    if (startMin) parts.push(`"Start" >= ${Number(startMin)}`);
    if (startMax) parts.push(`"Start" <= ${Number(startMax)}`);
    if (endMin)   parts.push(`"End"   >= ${Number(endMin)}`);
    if (endMax)   parts.push(`"End"   <= ${Number(endMax)}`);
    if (scoreMin) parts.push(`"Z-DNA Score" >= ${Number(scoreMin)}`);
    if (scoreMax) parts.push(`"Z-DNA Score" <= ${Number(scoreMax)}`);
    if (contains.trim()) {
      const needle = contains.trim().replace(/'/g, "''");
      parts.push(`"Sequence" ILIKE ${q('%' + needle + '%')}`);
    }
    return parts.join(' AND ');
  }, [species, lockedAssembly, chr, startMin, startMax, endMin, endMax, scoreMin, scoreMax, contains]);

  /* --------------------------------- Results SQL -------------------------------- */
  async function fetchRowsAndCount(p = page, size = rpp) {
    if (!hasQueryContext) return;
    setLoading(true);
    const offset = p * size;

    const sqlRows = `
      SELECT "Chromosome","Start","End","Z-DNA Score" AS Score,"Sequence"
      FROM data
      WHERE ${whereSql}
      ORDER BY "Z-DNA Score" DESC
      LIMIT ${size} OFFSET ${offset}
    `;
    const sqlCount = `
      SELECT COUNT(*) AS n
      FROM data
      WHERE ${whereSql}
    `;
    try {
      const [r, c] = await Promise.all([
        runSQL<Row>(sqlRows),
        runSQL<{ n: number }>(sqlCount),
      ]);
      setRows(r);
      setTotal(Number(getVal(c?.[0], 'n') ?? 0));
    } finally {
      setLoading(false);
    }
  }

  function onApply() {
    setPage(0);
    fetchRowsAndCount(0, rpp);
    if (tab === 'viz') fetchViz();
  }
  function onReset() {
    setChr(null); setChrInput('');
    setStartMin(''); setStartMax('');
    setEndMin('');   setEndMax('');
    setScoreMin(''); setScoreMax('');
    setContains('');
    setRows([]); setTotal(0);
  }

  useEffect(() => {
    if (!hasQueryContext) return;
    fetchRowsAndCount(page, rpp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rpp, whereSql, hasQueryContext]);

  /* ------------------------------------ Export ----------------------------------- */
  async function exportAll(fmt: 'csv'|'tsv'|'json'|'xml'|'xlsx') {
    if (!hasQueryContext) return;

    const cnt = await runSQL<{ n: number }>(`SELECT COUNT(*) AS n FROM data WHERE ${whereSql}`);
    const totalRows = Number(getVal(cnt?.[0], 'n') ?? 0);
    if (totalRows === 0) return;

    if (totalRows > MAX_EXPORT_ROWS) {
      alert(`This query would return ${fmtNum(totalRows)} rows.\nPlease use server-side export for very large downloads.\n(Current client cap: ${fmtNum(MAX_EXPORT_ROWS)} rows)`);
      return;
    }

    const selectSql = `
      SELECT "Chromosome","Start","End","Z-DNA Score" AS Score,"Sequence"
      FROM data
      WHERE ${whereSql}
      ORDER BY "Z-DNA Score" DESC
    `;

    let offset = 0;
    const all: Row[] = [];
    while (offset < totalRows) {
      const batchSql = `${selectSql} LIMIT ${BATCH_EXPORT} OFFSET ${offset}`;
      const part = await runSQL<Row>(batchSql);
      all.push(...part);
      offset += BATCH_EXPORT;
      if (offset >= MAX_EXPORT_ROWS) break;
    }

    const baseName = `zdna_export_${Date.now()}`;
    switch (fmt) {
      case 'csv':  downloadBlob(buildCsv(all, ','), `${baseName}.csv`, 'text/csv;charset=utf-8'); break;
      case 'tsv':  downloadBlob(buildCsv(all, '\t'), `${baseName}.tsv`, 'text/tab-separated-values;charset=utf-8'); break;
      case 'json': downloadBlob(buildJson(all), `${baseName}.json`, 'application/json;charset=utf-8'); break;
      case 'xml':  downloadBlob(buildXml(all), `${baseName}.xml`, 'application/xml;charset=utf-8'); break;
      case 'xlsx': downloadBlob(buildExcelHtml(all), `${baseName}.xls`, 'application/vnd.ms-excel;charset=utf-8'); break;
      default: break;
    }
  }

  /* -------------------------------- Visualizations ------------------------------- */
  // Two layouts share the same six panels:
  //  - single chromosome (one selected, or the genome has only one): site counts in
  //    10 bins along the chromosome, score/length vs position scatters;
  //  - genome-wide: site counts per chromosome, per-chromosome score/length bars.

  const [vizLoading, setVizLoading] = useState(false);
  const [viz, setViz] = useState<VizData | null>(null);
  const vizRequest = useRef(0);

  // Species / assembly part of the WHERE clause only (no user filters).
  const contextWhere = useMemo(() => {
    if (lockedAssembly) return `assembly = ${q(lockedAssembly)}`;
    if (species) return `assembly IN (SELECT assembly FROM metadata WHERE genome_size_manual >= 1000 AND tax_name = ${q(species)})`;
    return '1=0';
  }, [species, lockedAssembly]);

  async function fetchViz() {
    if (!hasQueryContext) return;
    const request = ++vizRequest.current;
    setVizLoading(true);
    try {
      const len = `("End" - "Start" + 1)`;
      // Per-chromosome summary; "total" counts all chromosomes. Beyond MAX_VIZ_CHROMOSOMES
      // keep only the top and lowest VIZ_CHROMOSOME_EDGE by site count.
      const sqlChrStats = `
        SELECT * FROM (
        SELECT s.*, m.scaffold_count AS scaffolds, m.genome_size_manual AS gsize, COUNT(*) OVER () AS total,
          ROW_NUMBER() OVER (ORDER BY n DESC, chr) AS rank_top,
          ROW_NUMBER() OVER (ORDER BY n ASC, chr DESC) AS rank_low
        FROM (
          SELECT assembly, "Chromosome" AS chr, COUNT(*) AS n,
            MIN("Z-DNA Score") AS s_min, quantile("Z-DNA Score", 0.25) AS s_q1, quantile("Z-DNA Score", 0.5) AS s_med,
            quantile("Z-DNA Score", 0.75) AS s_q3, MAX("Z-DNA Score") AS s_max,
            MIN(${len}) AS l_min, quantile(${len}, 0.25) AS l_q1, quantile(${len}, 0.5) AS l_med,
            quantile(${len}, 0.75) AS l_q3, MAX(${len}) AS l_max
          FROM data
          WHERE ${whereSql}
          GROUP BY assembly, "Chromosome"
        ) s
        LEFT JOIN metadata m ON m.assembly = s.assembly
        ) t
        WHERE total <= ${MAX_VIZ_CHROMOSOMES} OR rank_top <= ${VIZ_CHROMOSOME_EDGE} OR rank_low <= ${VIZ_CHROMOSOME_EDGE}
        ORDER BY rank_top
      `;
      const stats = await runSQL<Record<string, unknown>>(sqlChrStats).catch(() => []);
      if (request !== vizRequest.current) return;

      const num = (r: Record<string, unknown>, k: string) => Number(getVal(r, k));
      const chrStats: ChrStat[] = stats.map(r => ({
        assembly: String(getVal(r, 'assembly')),
        chr: String(getVal(r, 'chr')),
        n: num(r, 'n'),
        score: [num(r, 's_min'), num(r, 's_q1'), num(r, 's_med'), num(r, 's_q3'), num(r, 's_max')],
        length: [num(r, 'l_min'), num(r, 'l_q1'), num(r, 'l_med'), num(r, 'l_q3'), num(r, 'l_max')],
        scaffolds: num(r, 'scaffolds'),
        gsize: num(r, 'gsize'),
      }));
      const total = stats.length ? num(stats[0], 'total') : 0;
      const single = chrStats.length > 0 && (Boolean(chr) || total === 1);

      // Chromosome extent for the 10 bins. Chromosome lengths are not stored, so this is
      // the assembly size for single-sequence assemblies, otherwise the last predicted base.
      let chromLen = 0;
      if (single) {
        const chrName = chr ?? chrStats[0].chr;
        if (chrStats.every(s => s.scaffolds === 1 && s.gsize > 0)) {
          chromLen = Math.max(...chrStats.map(s => s.gsize));
        } else {
          const r = await runSQL<Record<string, unknown>>(
            `SELECT MAX("End") AS m FROM data WHERE ${contextWhere} AND "Chromosome" = ${q(chrName)}`
          ).catch(() => []);
          chromLen = Number(getVal(r[0], 'm') ?? 0);
        }
        if (request !== vizRequest.current) return;
      }
      const binSize = chromLen > 0 ? chromLen / VIZ_BINS : 0;

      const sqlScoreHist = `
        SELECT CAST(FLOOR(score/10)*10 AS INT) AS "bin", COUNT(*) AS "n"
        FROM (SELECT "Z-DNA Score" AS score FROM data WHERE ${whereSql}) f
        GROUP BY "bin" ORDER BY "bin"
      `;
      // Length bins of 10 bp aligned to the 9 bp minimum (9, 19, 29, …).
      const sqlLenHist = `
        SELECT CAST(9 + FLOOR((l - 9)/10)*10 AS INT) AS "bin", COUNT(*) AS "n"
        FROM (SELECT ${len} AS l FROM data WHERE ${whereSql}) f
        GROUP BY "bin" ORDER BY "bin"
      `;
      // Deterministic sample (same rows on every load).
      const sqlSample = `
        SELECT "Start" AS pos, ${len} AS len, "Z-DNA Score" AS score
        FROM data
        WHERE ${whereSql}
        ORDER BY hash(assembly, "Chromosome", "Start")
        LIMIT ${SCATTER_SAMPLE}
      `;
      const sqlBins = binSize > 0 ? `
        SELECT LEAST(GREATEST(CAST(FLOOR(("Start" - 1) / ${binSize}) AS INT), 0), ${VIZ_BINS - 1}) AS b, COUNT(*) AS n
        FROM data
        WHERE ${whereSql}
        GROUP BY 1
      ` : null;

      const [scoreHist, lenHist, sample, binRows] = await Promise.all([
        runSQL<Record<string, unknown>>(sqlScoreHist).catch(() => []),
        runSQL<Record<string, unknown>>(sqlLenHist).catch(() => []),
        runSQL<Record<string, unknown>>(sqlSample).catch(() => []),
        sqlBins ? runSQL<Record<string, unknown>>(sqlBins).catch(() => []) : Promise.resolve([]),
      ]);
      if (request !== vizRequest.current) return;

      const toHist = (rows: Record<string, unknown>[]) => rows
        .map(d => ({ bin: num(d, 'bin'), n: num(d, 'n') }))
        .filter(v => Number.isFinite(v.bin) && Number.isFinite(v.n));
      const bins = Array.from({ length: VIZ_BINS }, () => 0);
      binRows.forEach(d => { const b = num(d, 'b'); if (b >= 0 && b < VIZ_BINS) bins[b] = num(d, 'n'); });

      setViz({
        single,
        chromLen,
        binSize,
        bins,
        // Natural chromosome order, or by site count when the middle is collapsed.
        chrStats: total > MAX_VIZ_CHROMOSOMES ? chrStats : [...chrStats].sort((a, b) => naturalSort(a.chr, b.chr)),
        hiddenChromosomes: Math.max(0, total - chrStats.length),
        scoreHist: toHist(scoreHist),
        lenHist: toHist(lenHist),
        sample: sample
          .map(d => ({ pos: num(d, 'pos'), len: num(d, 'len'), score: num(d, 'score') }))
          .filter(v => [v.pos, v.len, v.score].every(Number.isFinite)),
      });
    } finally {
      if (request === vizRequest.current) setVizLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== 'viz') return;
    if (!hasQueryContext) return;
    fetchViz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, whereSql, chr, hasQueryContext]);

  /* ------------------------------- ECharts options ------------------------------ */

  const CHART_COLORS = {
    counts: '#0088fe',         // Blue
    scoreHist: '#8884d8',      // Purple
    scoreScatter: '#82ca9d',   // Green
    scoreBars: '#ff7300',      // Orange
    lengthHist: '#ff6b81',     // Pink
    lengthDist: '#26a69a',     // Teal
    lenScore: '#ffc658',       // Gold
  };
  const barOutline = { borderColor: '#000000', borderWidth: 1 };

  const baseTooltip = useMemo(
    () => ({
      backgroundColor: tooltipBg,
      textStyle: {
        fontSize: VIZ_FONT.compactTooltip,
        color: tooltipText,
      },
      padding: [6, 8],
      confine: true,
    }),
    [tooltipBg, tooltipText]
  );

  const vizOptions = useMemo(() => {
    const empty = { counts: null, scoreHist: null, scoreDist: null, lenHist: null, lenDist: null, lenScore: null };
    if (!viz) return empty;

    const axisLine = { show: true, lineStyle: { color: isDark ? '#ffffff' : '#000000', width: 2 } };
    // Left/bottom margins leave room for the axis titles, which sit outside the tick labels.
    const grid = { left: 45, right: 30, top: 20, bottom: 45, containLabel: true };
    // Axis-title gap that clears the widest tick label (titles sit outside the labels).
    const labelWidth = (labels: string[], fontSize = VIZ_FONT.base) =>
      Math.max(0, ...labels.map(l => l.length)) * fontSize * 0.62;
    const yGap = (labels: string[]) => labelWidth(labels) + 16;
    const axisName = (name: string, nameGap: number) => ({
      name, nameLocation: 'middle', nameGap, nameTextStyle: { color: axisNameColor },
    });
    // Value axis showing a tick ladder at equal distances.
    const ladderAxis = (ticks: number[], name: string) => ({
      type: 'value',
      min: 0,
      max: ticks.length - 1,
      interval: 1,
      axisLine,
      ...axisName(name, yGap(ticks.map(fmtNum))),
      axisLabel: { color: axisLabelColor, formatter: (v: number) => fmtNum(ticks[Math.round(v)]) },
    });
    const ladderXAxis = (ticks: number[], name: string) => ({
      ...ladderAxis(ticks, name),
      ...axisName(name, 35),
    });

    // Score / length counts (log y-axis, bins on a category x-axis).
    const histogram = (rows: { bin: number; n: number }[], xName: string, color: string) => {
      if (!rows.length) return null;
      const maxN = Math.max(...rows.map(r => r.n));
      return {
        grid,
        tooltip: {
          ...baseTooltip,
          trigger: 'item',
          axisPointer: { type: 'none' },
          formatter: (p: ChartParam) => `${p.name}: ${fmtNum(Number(p.value))}`,
          extraCssText: 'max-width: 140px; white-space: nowrap;',
        },
        xAxis: {
          type: 'category',
          data: rows.map(d => d.bin),
          axisLine,
          ...axisName(xName, 35),
          axisLabel: { formatter: (v: string | number) => String(v), color: axisLabelColor },
        },
        yAxis: {
          type: 'log',
          logBase: 10,
          axisLine,
          ...axisName('Counts', yGap([fmtNum(10 ** Math.ceil(Math.log10(Math.max(maxN, 1))))])),
          minorTick: { show: false },
          minorSplitLine: { show: false },
          axisLabel: { color: axisLabelColor },
        },
        series: [{ type: 'bar', data: rows.map(d => d.n), itemStyle: { color } }],
      };
    };

    // Chromosome category axis with slightly smaller labels so names don't overlap.
    const chrSlots: (ChrStat | null)[] = viz.hiddenChromosomes > 0
      ? [...viz.chrStats.slice(0, VIZ_CHROMOSOME_EDGE), null, ...viz.chrStats.slice(VIZ_CHROMOSOME_EDGE)]
      : viz.chrStats;
    const chrLabels = chrSlots.map(s => s?.chr ?? '…');
    const gapText = `${fmtNum(viz.hiddenChromosomes)} more chromosomes`;
    const chrFont = VIZ_FONT.base - 2;
    const chrRotate = chrLabels.length > 12 ? 45 : 0;
    const chrAxis = {
      type: 'category',
      data: chrLabels,
      axisLine,
      ...axisName('Chromosome', (chrRotate ? labelWidth(chrLabels, chrFont) * 0.71 : 0) + chrFont + 18),
      axisLabel: { interval: 0, rotate: chrRotate, fontSize: chrFont, color: axisLabelColor },
    };

    // 1. Site counts: 10 bins along one chromosome, or one bar per chromosome.
    const countValues = viz.single ? viz.bins : chrSlots.map(s => s?.n ?? null);
    const countTicks = ticksUpTo(COUNT_TICKS, Math.max(1_000, ...countValues.map(n => n ?? 0)));
    const counts = countValues.length ? {
      grid,
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (p: ChartParam) => (p.data?.raw == null ? gapText : `Counts: ${fmtNum(Number(p.data.raw))}`),
        extraCssText: 'white-space: nowrap;',
      },
      xAxis: viz.single
        ? {
          type: 'category',
          data: countValues.map((_, i) => String(i + 1)),
          axisLine,
          ...axisName(`${fmtBp(viz.binSize)} Bins`, 35),
          axisLabel: { color: axisLabelColor },
        }
        : chrAxis,
      yAxis: ladderAxis(countTicks, 'Counts'),
      series: [{
        type: 'bar',
        data: countValues.map(n => (n == null ? { value: null } : { value: tickPosition(countTicks, n), raw: n })),
        itemStyle: { color: CHART_COLORS.counts, ...barOutline },
      }],
    } : null;

    // 3. / 5. Score or length: vs position (single chromosome) or per-chromosome bars.
    const distribution = (
      label: string, ladder: number[], pick: (d: Sample) => number,
      statsOf: (s: ChrStat) => number[], scatterColor: string, barColor: string, unit: string,
    ) => {
      if (viz.single) {
        if (!viz.sample.length) return null;
        const ticks = ticksUpTo(ladder, Math.max(...viz.sample.map(pick)));
        const lenMb = viz.chromLen > 0 ? viz.chromLen / 1e6 : Math.max(...viz.sample.map(d => d.pos)) / 1e6;
        return {
          grid,
          tooltip: {
            ...baseTooltip,
            trigger: 'axis',
            extraCssText: 'max-width: 240px; white-space: nowrap;',
            formatter: (params: ChartParam[]) => {
              const d = params[0]?.data ?? {};
              return `Position: ${fmtNum(Number(d.pos))}\n${label}: ${fmtNum(Number(d.raw))}${unit}`;
            },
          },
          xAxis: {
            type: 'value',
            min: 0,
            max: lenMb,
            interval: lenMb / 4,
            axisLine,
            ...axisName('Genomic position (Mb)', 35),
            axisLabel: { formatter: (v: number) => fmtMb(v), color: axisLabelColor, showMaxLabel: true },
          },
          yAxis: ladderAxis(ticks, `Z-DNA ${label}`),
          series: [{
            type: 'scatter',
            symbolSize: 8,
            data: viz.sample.map(d => ({ value: [d.pos / 1e6, tickPosition(ticks, pick(d))], pos: d.pos, raw: pick(d) })),
            itemStyle: { color: scatterColor },
          }],
        };
      }
      if (!viz.chrStats.length) return null;
      // Linear axis from the minimum (score 50 / length 9) to just above the highest median.
      const ticks = linearTicks(ladder[0], Math.max(...viz.chrStats.map(s => statsOf(s)[2])));
      return {
        grid,
        tooltip: {
          ...baseTooltip,
          trigger: 'axis',
          extraCssText: 'max-width: 200px; white-space: nowrap;',
          formatter: (params: ChartParam[]) => {
            const p = params[0];
            if (!p.data?.stats) return gapText;
            const [mn, q1, med, q3, mx] = p.data.stats as number[];
            return [p.name, `Max: ${fmtNum(mx)}`, `Q3: ${fmtNum(q3)}`, `Median: ${fmtNum(med)}`,
              `Q1: ${fmtNum(q1)}`, `Min: ${fmtNum(mn)}`].join('<br/>');
          },
        },
        xAxis: chrAxis,
        yAxis: {
          type: 'value',
          min: ticks[0],
          max: ticks[ticks.length - 1],
          axisLine,
          ...axisName(`Median Z-DNA ${label}`, yGap(ticks.map(fmtNum))),
          axisTick: { customValues: ticks },
          axisLabel: { customValues: ticks, color: axisLabelColor, formatter: (v: number) => fmtNum(v) },
        },
        series: [{
          type: 'bar',
          data: chrSlots.map(s => (s ? { value: statsOf(s)[2], stats: statsOf(s) } : { value: null })),
          itemStyle: { color: barColor, ...barOutline },
        }],
      };
    };

    // 6. Length vs score on the same tick ladders as panels 3 and 5.
    const lenScore = viz.sample.length ? (() => {
      const xTicks = ticksUpTo(LENGTH_TICKS, Math.max(...viz.sample.map(d => d.len)));
      const yTicks = ticksUpTo(SCORE_TICKS, Math.max(...viz.sample.map(d => d.score)));
      return {
        grid,
        tooltip: {
          ...baseTooltip,
          trigger: 'item',
          extraCssText: 'max-width: 140px; white-space: nowrap;',
          formatter: (p: ChartParam) => `Length: ${fmtNum(Number(p.data?.len))} bp\nScore: ${fmtNum(Number(p.data?.score))}`,
        },
        xAxis: ladderXAxis(xTicks, 'Length (bp)'),
        yAxis: ladderAxis(yTicks, 'Z-DNA Score'),
        series: [{
          type: 'scatter',
          symbolSize: 5,
          data: viz.sample.map(d => ({ value: [tickPosition(xTicks, d.len), tickPosition(yTicks, d.score)], len: d.len, score: d.score })),
          itemStyle: { color: CHART_COLORS.lenScore },
        }],
      };
    })() : null;

    return {
      counts,
      scoreHist: histogram(viz.scoreHist, 'Score', CHART_COLORS.scoreHist),
      scoreDist: distribution('Score', SCORE_TICKS, d => d.score, s => s.score, CHART_COLORS.scoreScatter, CHART_COLORS.scoreBars, ''),
      lenHist: histogram(viz.lenHist, 'Length (bp)', CHART_COLORS.lengthHist),
      lenDist: distribution('Length', LENGTH_TICKS, d => d.len, s => s.length, CHART_COLORS.lengthDist, CHART_COLORS.lengthDist, ' bp'),
      lenScore,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viz, baseTooltip, axisLabelColor, axisNameColor, isDark]);

  /* -------------------------------------- UI ------------------------------------- */

  // Selected values must keep the same object between renders: a new object on every
  // keystroke makes Autocomplete treat it as a new selection and reset the typed text.
  const speciesValue = useMemo(() => (species ? { label: species } : null), [species]);
  const chrValue = useMemo(() => (chr ? { label: chr } : null), [chr]);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);

  const syncScroll = (source: HTMLElement, target: HTMLElement | null) => {
    if (!source || !target) return;
    target.scrollLeft = source.scrollLeft;
  };

  const vizPanel = (title: string, option: Record<string, unknown> | null) => (
    <Grid size={{ xs: 12, md: 6 }} sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, fontSize: VIZ_MUI_FONT.chartTitle }}>
        {title}
      </Typography>
      {option ? (
        <FullWidthChart option={option} height={400} deps={[tab, option]} />
      ) : (
        <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', height: 400 }}>
          {vizLoading ? 'Loading…' : 'No Z-DNA predictions for the current selection.'}
        </Box>
      )}
    </Grid>
  );

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Sequence search</Typography>

      {/* Species + Locked Assembly banner */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid>
            <Autocomplete
              options={speciesOpts}
              loading={loadingSpecies}
              value={speciesValue}
              inputValue={speciesInput}
              isOptionEqualToValue={(o, v) => o.label === v.label}
              onChange={(_, v) => { setSpecies(v?.label ?? null); setChr(null); setChrInput(''); }}
              onInputChange={(_, v) => setSpeciesInput(v)}
              filterOptions={(x) => x}
              getOptionLabel={(o) => o?.label ?? ''}
              sx={{ minWidth: 520 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  label="Species"  // Changed from "Species (tax_name)"
                  helperText="Type at least 2 characters to search"
                />
              )}
            />
          </Grid>
          <Grid sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {species && <Chip color="primary" label="Select" sx={{ display: 'none' }} />}
            {lockedAssembly && <Chip color="secondary" label={`Assembly: ${lockedAssembly}`} />}
          </Grid>
        </Grid>
      </Paper>

      {/* Filters */}
      {hasQueryContext && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2} alignItems="center">
            {/* Chromosome */}
            <Grid sx={{ marginRight: 2 }}>  {/* Added marginRight */}
              <Autocomplete
                options={chrOpts}
                loading={loadingChr}
                value={chrValue}
                inputValue={chrInput}
                isOptionEqualToValue={(o, v) => o.label === v.label}
                onChange={(_, v) => setChr(v?.label ?? null)}
                onInputChange={(_, v) => setChrInput(v)}
                filterOptions={(x) => x}
                getOptionLabel={(o) => o?.label ?? ''}
                sx={{ minWidth: { xs: '100%', md: 220 } }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    label="Chromosome"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px'
                      }
                    }}
                  />
                )}
              />
            </Grid>

            {/* Start */}
            <Grid>
              <TextField fullWidth label="Start ≥" type="number" value={startMin} onChange={(e) => setStartMin(e.target.value)} />
            </Grid>
            <Grid>
              <TextField fullWidth label="Start ≤" type="number" value={startMax} onChange={(e) => setStartMax(e.target.value)} />
            </Grid>

            {/* End */}
            <Grid>
              <TextField fullWidth label="End ≥" type="number" value={endMin} onChange={(e) => setEndMin(e.target.value)} />
            </Grid>
            <Grid>
              <TextField fullWidth label="End ≤" type="number" value={endMax} onChange={(e) => setEndMax(e.target.value)} />
            </Grid>

            {/* Z-DNA Score */}
            <Grid>
              <TextField fullWidth label="Z‑DNA Score ≥" type="number" value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} />
            </Grid>
            <Grid>
              <TextField fullWidth label="Z‑DNA Score ≤" type="number" value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} />
            </Grid>

            {/* Sequence contains */}
            <Grid>
              <TextField fullWidth label="Sequence contains" value={contains} onChange={(e) => setContains(e.target.value)} />
            </Grid>

            {/* Actions */}
            <Grid>
              <Button variant="contained" onClick={onApply} disabled={!hasQueryContext}>APPLY</Button>
            </Grid>
            <Grid>
              <Button onClick={onReset} disabled={!hasQueryContext}>RESET</Button>
            </Grid>

            {/* Export */}
            <Grid>
              <Tooltip title="Export">
                <span>
                  <Button startIcon={<DownloadIcon />} variant="outlined" disabled={!hasQueryContext} onClick={(e) => setExportAnchor(e.currentTarget)}>
                    EXPORT
                  </Button>
                </span>
              </Tooltip>
              <Menu anchorEl={exportAnchor} open={exportOpen} onClose={() => setExportAnchor(null)}>
                <MenuItem onClick={() => { setExportAnchor(null); exportAll('csv');  }}>Export CSV</MenuItem>
                <MenuItem onClick={() => { setExportAnchor(null); exportAll('tsv');  }}>Export TSV</MenuItem>
                <MenuItem onClick={() => { setExportAnchor(null); exportAll('json'); }}>Export JSON</MenuItem>
                <MenuItem onClick={() => { setExportAnchor(null); exportAll('xml');  }}>Export XML</MenuItem>
                <MenuItem onClick={() => { setExportAnchor(null); exportAll('xlsx'); }}>Export Excel</MenuItem>
              </Menu>
            </Grid>

            <Grid>
              <Tooltip title="Reload suggestions">
                <IconButton onClick={() => { /* optional */ }}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tab === 'results' ? 0 : 1}
          onChange={(_, v) => setTab(v === 0 ? 'results' : 'viz')}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Results" />
          <Tab label="Visualizations" />
        </Tabs>
      </Paper>

      {/* Results */}
      {tab === 'results' && (
        <Paper>
          <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>Results</Typography>
            {loading && <CircularProgress size={18} />}
          </Box>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rpp}
            onRowsPerPageChange={(e) => { setRpp(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          />

          <Box>
            {/* Top scrollbar */}
            <Box
              ref={topScrollRef}
              sx={{
                overflowX: "auto",
                height: 16,
                '&::-webkit-scrollbar': {
                  height: 16,
                  backgroundColor: '#f5f5f5'
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: '#bdbdbd',
                  borderRadius: 8,
                  backgroundClip: 'padding-box',
                  border: '4px solid transparent',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: '#f5f5f5'
                }
              }}
              onScroll={(e) => syncScroll(e.currentTarget, bottomScrollRef.current)}
            >
              <div style={{ 
                width: "150%",
                height: "1px",
                visibility: "hidden"
              }} />
            </Box>

            {/* Table with bottom scrollbar */}
            <TableContainer 
              ref={bottomScrollRef}
              sx={{
                width: "100%",
                overflowX: "auto",
                '&::-webkit-scrollbar': {
                  height: 16,
                  backgroundColor: '#f5f5f5'
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: '#bdbdbd',
                  borderRadius: 8,
                  backgroundClip: 'padding-box',
                  border: '4px solid transparent',
                },
                '&::-webkit-scrollbar-track': {
                  backgroundColor: '#f5f5f5'
                }
              }}
              onScroll={(e) => syncScroll(e.currentTarget, topScrollRef.current)}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Chromosome</TableCell>
                    <TableCell align="right">Start</TableCell>
                    <TableCell align="right">End</TableCell>
                    <TableCell align="right">Z‑DNA Score</TableCell>
                    <TableCell>Sequence</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.Chromosome}-${r.Start}-${i}`}>
                      <TableCell>{r.Chromosome}</TableCell>
                      <TableCell align="right">{fmtNum(r.Start)}</TableCell>
                      <TableCell align="right">{fmtNum(r.End)}</TableCell>
                      <TableCell align="right">{Number(r.Score).toFixed?.(2) ?? r.Score}</TableCell>
                      <TableCell sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{r.Sequence}</TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        {!hasQueryContext
                          ? 'Select Species or open with ?assembly=...'
                          : contextPredictions === 0
                            ? `0 Z-DNA predictions for ${lockedAssembly ? `assembly ${lockedAssembly}` : species}`
                            : 'No rows — refine filters and click APPLY'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rpp}
            onRowsPerPageChange={(e) => { setRpp(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          />
        </Paper>
      )}

      {/* Visualizations */}
      {tab === 'viz' && (
        <Paper sx={{ p: 2 }}>
          <Grid container spacing={2}>
            {vizPanel(viz?.single === false ? 'Z-DNA counts per chromosome' : 'Z-DNA counts (binned)', vizOptions.counts)}
            {vizPanel('Z-DNA Score counts', vizOptions.scoreHist)}
            {vizPanel(viz?.single === false ? 'Z-DNA Score distribution per chromosome' : 'Z-DNA Score distribution', vizOptions.scoreDist)}
            {vizPanel('Z-DNA Length counts', vizOptions.lenHist)}
            {vizPanel(viz?.single === false ? 'Z-DNA Length distribution per chromosome' : 'Z-DNA Length distribution', vizOptions.lenDist)}
            {vizPanel('Z-DNA Length vs Score (sampled)', vizOptions.lenScore)}
          </Grid>
          {viz?.single === false && viz.hiddenChromosomes > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Per-chromosome panels show the {VIZ_CHROMOSOME_EDGE} chromosomes with the most and the {VIZ_CHROMOSOME_EDGE} with the fewest
              Z-DNA predictions (ordered by count); "…" stands for the other {fmtNum(viz.hiddenChromosomes)}. Select a chromosome to see it on its own.
            </Typography>
          )}
        </Paper>
      )}
    </Box>
  );
}

function naturalSort(a: string, b: string) {
    // Split strings into text and number parts
    const reA = /[^\d]+|\d+/g;
    const partsA = a.match(reA) || [];
    const partsB = b.match(reA) || [];
    
    for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
        const partA = partsA[i];
        const partB = partsB[i];
        
        // Check if both parts are numeric
        const numA = parseInt(partA, 10);
        const numB = parseInt(partB, 10);
        
        if (!isNaN(numA) && !isNaN(numB)) {
            // Compare as numbers
            if (numA !== numB) return numA - numB;
        } else {
            // Compare as strings
            if (partA !== partB) return partA.localeCompare(partB);
        }
    }
    
    return partsA.length - partsB.length;
}
