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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ReactECharts from 'echarts-for-react';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../hooks/useDebounce';

/* ------------------------------- Types/Helpers ------------------------------ */

type Row = {
  Chromosome: string;
  Start: number;
  End: number;
  Score: number;      // mapped from "Z-DNA Score"
  Sequence: string;
};

type KV = { label: string };

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const AUTOCOMPLETE_LIMIT = 100;
const BATCH_EXPORT = 50_000;          // rows per export chunk
const MAX_EXPORT_ROWS = 1_000_000;    // safety cap for client export
const SCATTER_SAMPLE = 20_000;        // nominal sample size for scatter

const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const fmtNum = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : '');
const getVal = (o: any, k: string) => o?.[k] ?? o?.[k.toLowerCase()] ?? o?.[k.toUpperCase()];

function FullWidthChart({
  option,
  height = 400,
  deps = [],
  ...rest
}: {
  option: Record<string, unknown>;
  height?: number;
  deps?: any[];
  [key: string]: any;
}) {
  const ref = useRef<any>(null);

  useEffect(() => {
    // μικρή καθυστέρηση ώστε να έχει μετρηθεί σωστά το layout του Grid
    const t = setTimeout(() => {
      ref.current?.getEchartsInstance()?.resize();
    }, 0);
    return () => clearTimeout(t);
  }, deps);

  return (
    <ReactECharts
      ref={ref}
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge={true}
      lazyUpdate={false}
      {...rest}
    />
  );
}


/* --------------------------------- SQL runner -------------------------------- */
// FIX: normalize SQL to single line + better error handling (prevents 400s on some backends)
async function runSQL<T = any>(sql: string): Promise<T[]> {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const url = `/api/sql?query=${encodeURIComponent(normalized)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* ignore */ }
  if (!r.ok) {
    const msg = (j && j.error) ? String(j.error) : `SQL HTTP ${r.status}`;
    throw new Error(msg);
  }
  if (Array.isArray(j?.data)) return j.data as T[];
  if (Array.isArray(j?.rows) && Array.isArray(j?.columns)) {
    const cols: string[] = j.columns;
    return (j.rows as any[]).map((arr) =>
      Object.fromEntries(cols.map((c, i) => [c, arr[i]]))
    ) as T[];
  }
  return Array.isArray(j) ? (j as T[]) : [];
}

/* -------------------------------- Exporters -------------------------------- */

function buildCsv(rows: Row[], sep = ',') {
  const head = ['Chromosome', 'Start', 'End', 'Z-DNA Score', 'Sequence'];
  const escape = (v: any) => {
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
  const esc = (s: any) =>
    String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const items = rows.map(r =>
    `<row><Chromosome>${esc(r.Chromosome)}</Chromosome><Start>${r.Start}</Start><End>${r.End}</End><ZDNA_Score>${r.Score}</ZDNA_Score><Sequence>${esc(r.Sequence)}</Sequence></row>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${items.join('\n')}\n</rows>\n`;
}
function buildExcelHtml(rows: Row[]) {
  const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
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

    // Try tax_names table first
    let sql = `
      SELECT tax_name AS label 
      FROM tax_names 
      WHERE lower(tax_name) LIKE ${q(prefix.toLowerCase() + '%')} 
      ORDER BY 1 
      LIMIT ${AUTOCOMPLETE_LIMIT}
    `;

    try {
      const results = await runSQL<KV>(sql);
      if (results.length) {
        speciesSearchCache.set(cacheKey, results);
        return results;
      }
    } catch {
      // Fallback to metadata if tax_names fails
    }

    // Fallback: search in metadata
    sql = `
      SELECT DISTINCT tax_name AS label 
      FROM metadata 
      WHERE lower(tax_name) LIKE ${q(prefix.toLowerCase() + '%')} 
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
          where = `assembly IN (SELECT assembly FROM metadata WHERE tax_name = ${q(species!)})`;
        }

        const andPrefix = prefix ? `AND lower("Chromosome") LIKE ${q(prefix + '%')}` : '';
        const sql = `
          SELECT DISTINCT "Chromosome" AS label
          FROM data
          WHERE ${where} ${andPrefix}
          ORDER BY 1
          LIMIT ${AUTOCOMPLETE_LIMIT}
        `;
        const opts = await runSQL<KV>(sql);
        if (!dead) setChrOpts(opts);
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

    if (species)        parts.push(`assembly IN (SELECT assembly FROM metadata WHERE tax_name = ${q(species)})`);
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
      // eslint-disable-next-line no-await-in-loop
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

  const [vizLoading, setVizLoading] = useState(false);
  const [hist, setHist] = useState<{ bin: number; n: number }[]>([]);
  const [density, setDensity] = useState<{ start: number; n: number }[]>([]);
  const [scatter, setScatter] = useState<{ x: number; y: number }[]>([]);
  const [kmers, setKmers] = useState<{ motif: string; n: number }[]>([]);
  const [boxRows, setBoxRows] = useState<{ chr: string; min: number; q1: number; median: number; q3: number; max: number }[]>([]);
  const [lenScore, setLenScore] = useState<{ len: number; score: number }[]>([]); // NEW
  const [genomicDist, setGenomicDist] = useState<{ pos: number; score: number }[]>([]); // NEW

  async function fetchViz() {
    if (!hasQueryContext) return;
    setVizLoading(true);
    try {
      // 1) Histogram (no WITH; subquery)
      const sqlHist = `
        SELECT CAST(FLOOR(score/10)*10 AS INT) AS "bin", COUNT(*) AS "n"
        FROM (
          SELECT "Z-DNA Score" AS score
          FROM data
          WHERE ${whereSql}
        ) f
        GROUP BY "bin"
        ORDER BY "bin"
      `;

      // 2) Density (100kb windows) – relies only on whereSql (no double AND)
      const sqlDensity = chr ? `
        SELECT FLOOR("Start"/100000)*100000 AS "start", COUNT(*) AS "n"
        FROM data
        WHERE ${whereSql}
        GROUP BY 1
        ORDER BY 1
      ` : null;

      // 3) Start vs Score (per chr) – keep it light with LIMIT
      const sqlScatter = chr ? `
        SELECT "Start" AS "x", "Z-DNA Score" AS "y"
        FROM data
        WHERE ${whereSql}
        ORDER BY "Start"
        LIMIT ${SCATTER_SAMPLE}
      ` : null;

      // 4) Top central 8‑mers
      const sqlGenomicDist = `
        SELECT "Start" as pos, "Z-DNA Score" as score 
        FROM data
        WHERE ${whereSql}
        ORDER BY "Start"
        LIMIT ${SCATTER_SAMPLE}
      `;

      // 5) Box stats per chromosome (no WITH; subquery)
      const sqlBox = `
        SELECT
          chr, "min", q1, median, q3, "max"
        FROM (
          SELECT
            s.*,
            ROW_NUMBER() OVER (ORDER BY median DESC) AS rn,
            COUNT(*)    OVER ()                       AS total
          FROM (
            SELECT
              "chr",
              MIN(s)            AS "min",
              quantile(s,0.25)  AS q1,
              quantile(s,0.50)  AS median,
              quantile(s,0.75)  AS q3,
              MAX(s)            AS "max"
            FROM (
              SELECT "Chromosome" AS "chr", "Z-DNA Score" AS s
              FROM data
              WHERE ${whereSql}
            ) f
            GROUP BY "chr"
          ) AS s
        ) AS ranked
        WHERE rn <= CASE WHEN total <= 23 THEN total ELSE 15 END
        ORDER BY median DESC

      `;

      console.log('Box Plot SQL Query:', sqlBox.replace('${whereSql}', whereSql));

      // 6) Length vs Score (sampled with LIMIT)
      const sqlLenScore = `
        SELECT ("End" - "Start" + 1) AS "len", "Z-DNA Score" AS "score"
        FROM data
        WHERE ${whereSql}
        ORDER BY "Start"
        LIMIT ${SCATTER_SAMPLE}
      `;

      const results = await Promise.allSettled([
        runSQL<{ bin: number; n: number }>(sqlHist),
        sqlDensity ? runSQL<{ start: number; n: number }>(sqlDensity) : Promise.resolve([]),
        sqlScatter ? runSQL<{ x: number; y: number }>(sqlScatter) : Promise.resolve([]),
        runSQL<{ motif: string; n: number }>(sqlGenomicDist),
        runSQL<{ chr: string; min: number; q1: number; median: number; q3: number; max: number }>(sqlBox),
        runSQL<{ len: number; score: number }>(sqlLenScore),
      ]);

      const ok = <T,>(i: number, def: T): T =>
        results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<T>).value : def;

      setHist(ok(0, []).map(d => ({ bin: Number(getVal(d, 'bin')), n: Number(getVal(d, 'n')) }))
        .filter(v => Number.isFinite(v.bin) && Number.isFinite(v.n)));

      setDensity(ok(1, []).map(d => ({ start: Number(getVal(d, 'start')), n: Number(getVal(d, 'n')) }))
        .filter(v => Number.isFinite(v.start) && Number.isFinite(v.n)));

      setScatter(ok(2, []).map(d => ({ x: Number(getVal(d, 'x')), y: Number(getVal(d, 'y')) }))
        .filter(v => Number.isFinite(v.x) && Number.isFinite(v.y)));

      setGenomicDist(ok(3, []).map(d => ({
        pos: Number(getVal(d, 'pos')),
        score: Number(getVal(d, 'score'))
      })).filter(v => Number.isFinite(v.pos) && Number.isFinite(v.score)));

      setBoxRows(ok(4, []).map(d => ({
        chr:    String(getVal(d, 'chr')),
        min:    Number(getVal(d, 'min')),
        q1:     Number(getVal(d, 'q1')),
        median: Number(getVal(d, 'median')),
        q3:     Number(getVal(d, 'q3')),
        max:    Number(getVal(d, 'max')),
      })).filter(v => v.chr && [v.min, v.q1, v.median, v.q3, v.max].every(Number.isFinite)));

      setLenScore(ok(5, []).map(d => ({ len: Number(getVal(d, 'len')), score: Number(getVal(d, 'score')) }))
        .filter(v => Number.isFinite(v.len) && Number.isFinite(v.score)));

    } finally {
      setVizLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== 'viz') return;
    if (!hasQueryContext) return;
    fetchViz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, whereSql, chr, hasQueryContext]);

  /* ------------------------------- ECharts options ------------------------------ */

  // Common grid settings with enough margin for axis labels
  const commonGrid = {
    left: '12%',    // More space for y-axis label
    right: '4%',
    top: '10%',
    bottom: '12%',  // More space for x-axis label
    containLabel: true
  };

  // Color constants
  const CHART_COLORS = {
    histogram: '#8884d8',      // Purple
    genomicDist: '#82ca9d',    // Green
    lenScore: '#ffc658',       // Gold
    boxplot: '#ff7300',        // Orange
    density: '#0088fe',        // Blue
    scatter: '#ff6b81'         // Pink
  };

  // 1. Histogram
  const histOpt = useMemo(() => ({
    grid: commonGrid,
    xAxis: {
      type: 'category',
      name: 'Z-DNA Score',
      nameLocation: 'middle',
      nameGap: 35,  // Distance of label from axis
    },
    yAxis: {
      type: 'value',
      name: 'Count',
      nameLocation: 'middle',
      nameGap: 45,  // Distance of label from axis
    },
    series: [{
      type: 'bar',
      data: hist.map(d => Number(d.n)),
      itemStyle: {
        color: CHART_COLORS.histogram
      }
    }],
  }), [hist]);

  // 2. Density
  const densityOpt = useMemo(() => {
    if (!density.length) return null;
    return {
      grid: commonGrid,
      xAxis: {
        type: 'value',
        name: 'Position',
        nameLocation: 'middle',
        nameGap: 35,
        axisLabel: { formatter: (v: number) => fmtNum(v) }
      },
      yAxis: {
        type: 'value',
        name: 'Sites / 100kb',
        nameLocation: 'middle',
        nameGap: 45
      },
      series: [{
        type: 'bar',
        data: density.map(d => [d.start, d.n]),
        itemStyle: {
          color: CHART_COLORS.density
        }
      }],
    };
  }, [density]);

  // 3. Scatter
  const scatterOpt = useMemo(() => {
    if (!scatter.length) return null;
    return {
      grid: commonGrid,
      xAxis: {
        type: 'value',
        name: 'Start Position',
        nameLocation: 'middle',
        nameGap: 35,
        axisLabel: { formatter: (v: number) => fmtNum(v) }
      },
      yAxis: {
        type: 'value',
        name: 'Z-DNA Score',
        nameLocation: 'middle',
        nameGap: 45
      },
      series: [{
        type: 'scatter',
        symbolSize: 5,
        data: scatter.map(d => [d.x, d.y]),
        itemStyle: {
          color: CHART_COLORS.scatter
        }
      }],
    };
  }, [scatter]);

  /*
  const kmerOpt = useMemo(() => {
    const x = kmers.map(k => k.motif);
    const y = kmers.map(k => k.n);
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: x, axisLabel: { rotate: 45 } },
      yAxis: { type: 'value', name: 'Count' },
      series: [{ type: 'bar', data: y }],
      grid: { left: 50, right: 20, top: 30, bottom: 80 },
    };
  }, [kmers]);
  */
  const boxOpt = useMemo(() => {
    if (!boxRows.length) return null;
    return {
      grid: {
        ...commonGrid,
        bottom: '15%'  // Extra space for rotated labels
      },
      xAxis: {
        type: 'category',
        name: 'Chromosome',
        nameLocation: 'middle',
        nameGap: 45,
        axisLabel: { rotate: 45 }
      },
      yAxis: {
        type: 'value',
        name: 'Z-DNA Score',
        nameLocation: 'middle',
        nameGap: 45
      },
      series: [{
        type: 'boxplot',
        data: boxRows.map(b => [b.min, b.q1, b.median, b.q3, b.max]),
        itemStyle: {
          color: CHART_COLORS.boxplot,
          borderColor: CHART_COLORS.boxplot
        }
      }],
    };
  }, [boxRows]);

  const lenScoreOpt = useMemo(() => {
    if (!lenScore.length) return null;
    return {
      tooltip: { trigger: 'item', formatter: (p: any) => `Length: ${fmtNum(p.value[0])} bp<br/>Score: ${Number(p.value[1]).toFixed(2)}` },
      xAxis: {
        type: 'value',
        name: 'Length (bp)',
        nameLocation: 'middle',
        nameGap: 35,
        axisLabel: { formatter: (v: number) => fmtNum(v) }
      },
      yAxis: {
        type: 'value',
        name: 'Z‑DNA Score',
        nameLocation: 'middle',
        nameGap: 45
      },
      series: [{
        type: 'scatter',
        symbolSize: 5,
        data: lenScore.map(d => [d.len, d.score]),
        itemStyle: {
          color: CHART_COLORS.lenScore
        }
      }],
      grid: commonGrid
    };
  }, [lenScore]);

  const genomicDistOpt = useMemo(() => {
    if (!genomicDist.length) return null;
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          return `Position: ${fmtNum(p.value[0])}<br/>Score: ${p.value[1].toFixed(2)}`;
        }
      },
      xAxis: {
        type: 'value',
        name: 'Genomic Position (coordinate)',
        nameLocation: 'middle',
        nameGap: 35,
        axisLabel: { formatter: (v: number) => fmtNum(v) }
      },
      yAxis: {
        type: 'value',
        name: 'Z-DNA Score',
        nameLocation: 'middle',
        nameGap: 45
      },
      series: [{
        type: 'scatter',
        symbolSize: 8,
        data: genomicDist.map(d => [d.pos, d.score]),
        itemStyle: {
          color: CHART_COLORS.genomicDist
        }
      }],
      grid: commonGrid
    };
  }, [genomicDist]);

  /* -------------------------------------- UI ------------------------------------- */

  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);

  const syncScroll = (source: HTMLElement, target: HTMLElement | null) => {
    if (!source || !target) return;
    target.scrollLeft = source.scrollLeft;
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Sequence search</Typography>

      {/* Species + Locked Assembly banner */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8} lg={6}>
            <Autocomplete
              options={speciesOpts}
              loading={loadingSpecies}
              value={species ? { label: species } : null}
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
          <Grid item xs={12} md={4} lg={6} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
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
            <Grid item xs={12} md={2} sx={{ marginRight: 2 }}>  {/* Added marginRight */}
              <Autocomplete
                options={chrOpts}
                loading={loadingChr}
                value={chr ? { label: chr } : null}
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
            <Grid item xs={12} md={3} lg={2}>
              <TextField fullWidth label="Start ≥" type="number" value={startMin} onChange={(e) => setStartMin(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={3} lg={2}>
              <TextField fullWidth label="Start ≤" type="number" value={startMax} onChange={(e) => setStartMax(e.target.value)} />
            </Grid>

            {/* End */}
            <Grid item xs={12} md={3} lg={2}>
              <TextField fullWidth label="End ≥" type="number" value={endMin} onChange={(e) => setEndMin(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={3} lg={2}>
              <TextField fullWidth label="End ≤" type="number" value={endMax} onChange={(e) => setEndMax(e.target.value)} />
            </Grid>

            {/* Z-DNA Score */}
            <Grid item xs={12} md={3} lg={2}>
              <TextField fullWidth label="Z‑DNA Score ≥" type="number" value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} />
            </Grid>
            <Grid item xs={12} md={3} lg={2}>
              <TextField fullWidth label="Z‑DNA Score ≤" type="number" value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} />
            </Grid>

            {/* Sequence contains */}
            <Grid item xs={12} md={6} lg={4}>
              <TextField fullWidth label="Sequence contains" value={contains} onChange={(e) => setContains(e.target.value)} />
            </Grid>

            {/* Actions */}
            <Grid item xs={12} md="auto">
              <Button variant="contained" onClick={onApply} disabled={!hasQueryContext}>APPLY</Button>
            </Grid>
            <Grid item xs={12} md="auto">
              <Button onClick={onReset} disabled={!hasQueryContext}>RESET</Button>
            </Grid>

            {/* Export */}
            <Grid item xs={12} md="auto">
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

            <Grid item xs={12} md="auto">
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
                        {hasQueryContext ? 'No rows — refine filters and click APPLY' : 'Select Species or open with ?assembly=...'}
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
  {/* ΕΠΙΒΟΛΗ 100% πλάτους στα wrappers του echarts-for-react */}
  <Box sx={{
    '& .echarts-for-react': { width: '100% !important' },
    '& .echarts-for-react > div': { width: '100% !important' }
  }}>
    {/* Row 1 */}
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid item xs={12} md={6} sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Z-DNA Score — Histogram</Typography>
        <FullWidthChart option={histOpt} height={400} deps={[tab, histOpt]} />
      </Grid>
      <Grid item xs={12} md={6} sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Genomic Distribution</Typography>
        {genomicDistOpt ? (
          <FullWidthChart option={genomicDistOpt} height={400} deps={[tab, genomicDistOpt]} />
        ) : (
          <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', height: 400 }}>
            No data available for genomic distribution plot.
          </Box>
        )}
      </Grid>

      {/* Row 1 */}
      { /*}
      <Grid item xs={12} md={6} sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Top central 8-mers</Typography>
        <FullWidthChart option={kmerOpt} height={400} deps={[tab, kmerOpt]} />
      </Grid>
      */ }
    </Grid>

    {/* Row 2 */}
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid item xs={12} md={6}  sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Length vs Z-DNA Score (limited sample)</Typography>
        {lenScoreOpt ? (
          <FullWidthChart option={lenScoreOpt} height={400} deps={[tab, lenScoreOpt]} />
        ) : (
          <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', height: 400 }} />
        )}
      </Grid>
      <Grid item xs={12} md={6}  sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Z-DNA Score — per Chromosome (top 15 by median)</Typography>
        {boxOpt ? (
          <FullWidthChart option={boxOpt} height={400} deps={[tab, boxOpt]} />
        ) : (
          <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', height: 400 }} />
        )}
      </Grid>
    </Grid>

    {/* Row 3 */}
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}  sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Z-DNA Density per 100 kb {chr ? `— ${chr}` : '(select chromosome)'}</Typography>
        {densityOpt ? (
          <FullWidthChart option={densityOpt} height={400} deps={[tab, chr, densityOpt]} />
        ) : (
          <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', height: 400 }} />
        )}
      </Grid>
      <Grid item xs={12} md={6}  sx={{ width: '45%' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Z-DNA Score across Genomic Positions {chr ? `— ${chr}` : '(select chromosome)'}</Typography>
        {scatterOpt ? (
          <FullWidthChart option={scatterOpt} height={400} deps={[tab, chr, scatterOpt]} />
        ) : (
          <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', height: 400 }} />
        )}
      </Grid>
    </Grid>

  </Box>
</Paper>
      )}
    </Box>
  );
}
