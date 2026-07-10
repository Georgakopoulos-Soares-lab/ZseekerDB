import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Grid,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ReactECharts from 'echarts-for-react';

/* =============================================================================
   helpers
   ========================================================================== */

   // ---- color helpers ----
function hslToHex(h: number, s: number, l: number) {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) [r, g, b] = [c, x, 0];
  else if (60 <= h && h < 120) [r, g, b] = [x, c, 0];
  else if (120 <= h && h < 180) [r, g, b] = [0, c, x];
  else if (180 <= h && h < 240) [r, g, b] = [0, x, c];
  else if (240 <= h && h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Δίνει διαφορετικό χρώμα σε ΚΑΘΕ node.
 * - Χρησιμοποιεί golden-angle spread για ξεχωριστές αποχρώσεις στα αδέρφια.
 * - Κλιμακώνει lightness ανά βάθος για διακριτότητα στα levels.
 */
function colorizeTree(nodes: TreeNode[], depth = 0, hueOffset = 0) {
  if (!nodes) return;
  const GOLDEN = 137.508; // golden angle σε μοίρες
  const lightness = [0.55, 0.50, 0.45, 0.40, 0.35][Math.min(depth, 4)];
  const saturation = 0.62;

  nodes.forEach((n, i) => {
    const h = (hueOffset + i * GOLDEN) % 360;
    n.itemStyle = n.itemStyle || {};
    n.itemStyle.color = hslToHex(h, saturation, lightness);
    if (n.children && n.children.length) {
      // διαφορετικό offset ανά κλάδο για να μη “συμπέσουν” αποχρώσεις σε άλλα levels
      colorizeTree(n.children, depth + 1, (h + 23) % 360);
    }
  });
}

async function fetchSql<T = any>(sql: string): Promise<T[]> {
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

  const rows = (Array.isArray(j?.rows) ? j.rows
             : Array.isArray(j?.data) ? j.data
             : []) as T[];
  return rows;
}

const fmtInt = (n: number | null | undefined) =>
  (typeof n === 'number' && Number.isFinite(n)) ? n.toLocaleString() : '—';

const fmtPercent = (n: number | null | undefined, digits = 2) =>
  (typeof n === 'number' && Number.isFinite(n)) ? `${n.toFixed(digits)}%` : '—';

const fmtBig = (n: number | null | undefined) =>
  (typeof n === 'number' && Number.isFinite(n)) ? n.toLocaleString() : '—';

type KV = { label: string; n: number };

type AggRow = {
  superkingdom: string | null;
  kingdom: string | null;
  phylum: string | null;
  tax_name: string | null;
  n: number;
};

type TreeNode = {
  name: string;
  value: number;
  children?: TreeNode[];
  itemStyle?: { color?: string };
};

/** Βασική παλέτα superkingdoms (ίδια με home / metadata) */
const SUPERKINGDOM_COLORS = ['#4D77A9', '#F08F2A', '#E25558', '#77B7B3'] as const;

/** Κανονικοποίηση superkingdom σε 4 σταθερές κατηγορίες */
const SK_ORDER = ['Archaea', 'Bacteria', 'Eukaryota', 'Viruses'] as const;
type SK = typeof SK_ORDER[number];

/** Σταθερό χρώμα ανά superkingdom */
const SK_COLOR: Record<SK, string> = {
  Archaea:  SUPERKINGDOM_COLORS[0],
  Bacteria: SUPERKINGDOM_COLORS[1],
  Eukaryota: SUPERKINGDOM_COLORS[2],
  Viruses:  SUPERKINGDOM_COLORS[3],
};


function canonSK(s: string | null): SK | null {
  const x = (s ?? '').trim().toLowerCase();
  if (x === 'archaea') return 'Archaea';
  if (x === 'bacteria') return 'Bacteria';
  if (x === 'eukaryota' || x === 'eukaryotes' || x === 'eukaryote') return 'Eukaryota';
  if (x === 'viruses' || x === 'virus') return 'Viruses';
  return null; // κρατάμε αυστηρά τα 4
}

/** Μπλε παλέτα (βαθιές αποχρώσεις – χωρίς πολύ ανοιχτά) */
const BLUE_PALETTE = [
  '#0B3C8C','#0F4AA8','#1558C4','#1C66DF','#2A73F2',
  '#3A7FF6','#4D8AF7','#5C95F8','#6AA0F9','#79AAFA'
];

/** Σταθερό base χρώμα ανά superkingdom (ώστε το 1ο επίπεδο να μην “λευκίζει”) */
/*
const SK_COLOR: Record<SK, string> = {
  Archaea:  '#1558C4',
  Bacteria: '#1C66DF',
  Eukaryota:'#2A73F2',
  Viruses:  '#0B3C8C',
};
*/
/* ------------------------------- UI micro components ------------------------------- */

function StatCard({ title, value, sx }: { title: string; value: string; sx?: any }) {
  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        ...sx
      }}
    >
      <Typography variant="caption" color="text.secondary">{title}</Typography>
      <Typography variant="h6" sx={{ mt: .5 }}>{value}</Typography>
    </Paper>
  );
}

function TopListCard({ title, items }: { title: string; items: KV[] }) {
  return (
    <Paper elevation={1} sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{title}</Typography>
      <Box sx={{ mt: 1, display: 'grid', rowGap: 1 }}>
        {items.map((it, i) => (
          <Box key={`${it.label}-${i}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" noWrap sx={{ pr: 2 }}>{it.label || '(unknown)'}</Typography>
            <Typography variant="body2" color="text.secondary">{fmtInt(it.n)}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/* =============================================================================
   page
   ========================================================================== */

export default function MetadataStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const breadcrumbBg = isDarkMode ? '#424242' : '#333333';
  const breadcrumbText = '#FFFFFF';

  // Overview KPIs
  const [totalAssemblies, setTotalAssemblies] = useState<number | null>(null);
  const [uniqueTaxids, setUniqueTaxids] = useState<number | null>(null);
  const [avgGenome, setAvgGenome] = useState<number | null>(null);
  const [minGenome, setMinGenome] = useState<number | null>(null);
  const [maxGenome, setMaxGenome] = useState<number | null>(null);
  const [avgGC, setAvgGC] = useState<number | null>(null);
  const [minGC, setMinGC] = useState<number | null>(null);
  const [maxGC, setMaxGC] = useState<number | null>(null);

  // Add new state variables for the additional metrics
  const [totalSuperkingdoms, setTotalSuperkingdoms] = useState<number | null>(null);
  const [totalKingdoms, setTotalKingdoms] = useState<number | null>(null);
  const [totalPhylum, setTotalPhylum] = useState<number | null>(null);
  const [totalClasses, setTotalClasses] = useState<number | null>(null);
  const [totalOrders, setTotalOrders] = useState<number | null>(null);
  const [totalFamilies, setTotalFamilies] = useState<number | null>(null);
  const [totalGenus, setTotalGenus] = useState<number | null>(null);

  // side metrics
  const [superkingdoms, setSuperkingdoms] = useState<KV[]>([]);
  const [topKingdoms, setTopKingdoms] = useState<KV[]>([]);
  const [topGenus, setTopGenus] = useState<KV[]>([]);
  const [assemblyLevels, setAssemblyLevels] = useState<KV[]>([]);

  // treemap data
  const [treeData, setTreeData] = useState<TreeNode[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 1) Overview
        const overviewSql = `
          SELECT
            COUNT(*)                                AS total_assemblies,
            COUNT(distinct superkingdom)            AS total_superkingdoms,
            count(distinct kingdom) AS total_kingdoms,
            count(distinct phylum) AS total_phylum,
            count(distinct class) AS total_classes,
            count(distinct "order") AS total_orders,
            count(distinct family) AS total_families, 
            count(distinct genus) AS total_genus,
            count(distinct genus) AS total_genus,
            COUNT(DISTINCT tax_name)                   AS unique_species,
            AVG(try_cast(genome_size AS DOUBLE))    AS avg_genome_size,
            MIN(try_cast(genome_size AS DOUBLE))    AS min_genome_size,
            MAX(try_cast(genome_size AS DOUBLE))    AS max_genome_size,
            ROUND(AVG(try_cast(gc_percent  AS DOUBLE)), 2)    AS avg_gc,
            MIN(try_cast(gc_percent  AS DOUBLE))    AS min_gc,
            MAX(try_cast(gc_percent  AS DOUBLE))    AS max_gc
          FROM metadata
          WHERE genome_size >= 1000
        `;
        const [ov] = await fetchSql<any>(overviewSql);

        // 2) Superkingdoms (sidebar)
        const superSql = `
          SELECT coalesce(superkingdom,'(unknown)') AS label, COUNT(*) AS n
          FROM metadata
          WHERE genome_size >= 1000
          GROUP BY 1
          ORDER BY n DESC
        `;
        const sup = await fetchSql<KV>(superSql);

        // 3) Top 5 Kingdoms
        const topKSql = `
          SELECT kingdom AS label, COUNT(*) AS n
          FROM metadata
          WHERE kingdom IS NOT NULL AND kingdom <> '' AND genome_size >= 1000
          GROUP BY 1
          ORDER BY n DESC
          LIMIT 5
        `;
        const tK = await fetchSql<KV>(topKSql);

        // 4) Top 5 Genus
        const topGSql = `
          SELECT genus AS label, COUNT(*) AS n
          FROM metadata
          WHERE genus IS NOT NULL AND genus <> '' AND 
            genus NOT LIKE '%unclassified%' AND 
            genome_size >= 1000
          GROUP BY 1
          ORDER BY n DESC
          LIMIT 5
        `;
        const tG = await fetchSql<KV>(topGSql);

        // 5) Assembly levels
        const asmSql = `
          SELECT coalesce(assembly_level,'(unknown)') AS label, COUNT(*) AS n
          FROM metadata
          WHERE genome_size >= 1000
          GROUP BY 1
          ORDER BY n DESC
        `;
        const asm = await fetchSql<KV>(asmSql);

        // 6) Drill‑down distribution (SK → Kingdom → Phylum → tax_name)
        const distSql = `
          SELECT
            superkingdom, kingdom, phylum, tax_name, COUNT(*) AS n
          FROM metadata
          WHERE genome_size >= 1000
          GROUP BY 1,2,3,4
        `;
        const dist = await fetchSql<AggRow>(distSql);

        if (cancelled) return;

        setTotalAssemblies(Number(ov?.total_assemblies ?? null));
        setUniqueTaxids(Number(ov?.unique_species ?? null));
        setAvgGenome(Number(ov?.avg_genome_size ?? null));
        setMinGenome(Number(ov?.min_genome_size ?? null));
        setMaxGenome(Number(ov?.max_genome_size ?? null));
        setAvgGC(Number(ov?.avg_gc ?? null));
        setMinGC(Number(ov?.min_gc ?? null));
        setMaxGC(Number(ov?.max_gc ?? null));

        // Set the new metrics
        setTotalSuperkingdoms(Number(ov?.total_superkingdoms ?? null));
        setTotalKingdoms(Number(ov?.total_kingdoms ?? null));
        setTotalPhylum(Number(ov?.total_phylum ?? null));
        setTotalClasses(Number(ov?.total_classes ?? null));
        setTotalOrders(Number(ov?.total_orders ?? null));
        setTotalFamilies(Number(ov?.total_families ?? null));
        setTotalGenus(Number(ov?.total_genus ?? null));

        setSuperkingdoms(sup);
        setTopKingdoms(tK);
        setTopGenus(tG);
        setAssemblyLevels(asm);

        // -------------------------- build hierarchical tree -------------------------
        const root: Record<SK, Map<string, Map<string, Map<string, number>>>> = {
          Archaea: new Map(), Bacteria: new Map(), Eukaryota: new Map(), Viruses: new Map()
        };

        for (const r of dist) {
          const sk = canonSK(r.superkingdom);
          if (!sk) continue;

          const k = (r.kingdom ?? '(unknown)').trim() || '(unknown)';
          const p = (r.phylum ?? '(unknown)').trim() || '(unknown)';
          const t = (r.tax_name ?? '(unknown)').trim() || '(unknown)';
          const n = Number(r.n) || 0;

          const mK = root[sk];
          if (!mK.has(k)) mK.set(k, new Map());
          const mP = mK.get(k)!;
          if (!mP.has(p)) mP.set(p, new Map());
          const mT = mP.get(p)!;
          mT.set(t, (mT.get(t) || 0) + n);
        }

        // Top‑30 trimming per επίπεδο
        const toNode = (sk: SK): TreeNode | null => {
          const mK = root[sk];
          if (!mK.size) return null;

          const kChildren: TreeNode[] = [];
          for (const [k, mP] of mK) {
            // ---- Phylum children (top 30 per kingdom)
            let pChildren: TreeNode[] = [];
            for (const [p, mT] of mP) {
              // ---- Species children (top 30 per phylum)
              const entriesT = Array.from(mT.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 30);

              const tChildren: TreeNode[] = entriesT.map(([t, cnt]) => {
                const raw = Math.max(1, cnt);         // ασφάλεια να μην έχουμε 0
                const v = Math.log10(raw);           // log10
                return { name: t, value: v };
              });

              const pSum = tChildren.reduce((s, n) => s + n.value, 0);
              pChildren.push({ name: p, value: pSum, children: tChildren });
            }

            pChildren = pChildren.sort((a, b) => b.value - a.value).slice(0, 30);
            const kSum = pChildren.reduce((s, n) => s + n.value, 0);
            kChildren.push({ name: k, value: kSum, children: pChildren });
          }

          const kTop = kChildren.sort((a, b) => b.value - a.value).slice(0, 30);
          const skSum = kTop.reduce((s, n) => s + n.value, 0);

          // σταθερό χρώμα από παλέτα superkingdoms
          return { name: sk, value: skSum, children: kTop, itemStyle: { color: SK_COLOR[sk] } };
        };

        const data: TreeNode[] = SK_ORDER
          .map(toNode)
          .filter((n): n is TreeNode => !!n);

        // Δώσε μοναδικά χρώματα σε ΟΛΑ τα nodes (όλα τα levels)
        // colorizeTree(data);

        setTreeData(data);

      } catch (e: any) {
        setError(e?.message || 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const hasData = useMemo(() => !loading && !error, [loading, error]);

  const avgGenomeText =
    typeof avgGenome === 'number' && Number.isFinite(avgGenome)
      ? avgGenome.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '—';

  const minGenomeText = fmtBig(minGenome);
  const maxGenomeText = fmtBig(maxGenome);

  const avgGcText = fmtPercent(avgGC, 2);
  const minGcText = fmtPercent(minGC, 2);
  const maxGcText = fmtPercent(maxGC, 2);

  // ------------------------------ ECharts Treemap ------------------------------
const treemapOption = useMemo(() => ({
  backgroundColor: 'transparent',

  tooltip: {
    formatter: (info: any) => {
      const name = info.name;
      const value = info.value;
      return `${name}<br/>log10(count sum): ${value.toFixed(2)}`;
    },
  },
  series: [{
    name: 'Superkingdoms',
    type: 'treemap',
    data: treeData,
    leafDepth: 1,
    nodeClick: 'zoomToNode',
    roam: false,
    squareRatio: 0.9,
    colorMappingBy: 'index',

    // labels
label: {
  show: true,
  formatter: '{b}',
  color: isDarkMode ? '#ffffff' : '#111111',   // 👈 ΔΥΝΑΜΙΚΟ ΧΡΩΜΑ
  overflow: 'truncate',
  fontSize: 13,
  minFontSize: 11,
},

upperLabel: {
  show: true,
  height: 28,
  color: isDarkMode ? '#ffffff' : '#111111',   // 👈 ΔΥΝΑΜΙΚΟ ΧΡΩΜΑ
  formatter: '{b}',
  textStyle: {
    fontSize: 14,
    fontWeight: 600,
    color: isDarkMode ? '#ffffff' : '#111111', // 👈 ΕΠΙΠΛΕΟΝ εδώ
  },
},

    // Γενικό style: ΚΑΘΟΛΟΥ άσπρα borders
    itemStyle: {
      borderColor: 'transparent',
      borderWidth: 0,
    },

    // 🔹 breadcrumb ΜΕΣΑ στη σειρά, ΟΧΙ μέσα στο levels[]
    breadcrumb: {
      show: true,
      height: 28,
      left: 'center',
      bottom: 4,
      itemStyle: {
        color: breadcrumbBg,       // από το theme (dark / light)
        borderColor: 'transparent',
      },
      textStyle: {
        color: breadcrumbText,     // π.χ. #FFFFFF
        fontSize: 12,
        fontWeight: 500,
      },
      emphasis: {
        itemStyle: { color: breadcrumbBg },
        textStyle: { color: breadcrumbText },
      },
    },

    // επίπεδα treemap
    levels: [
      {
        // level 0: Superkingdoms
        minArea: 4000, // δίνει αρκετό χώρο ώστε να φανούν και Eukaryota / Archaea
        itemStyle: {
          borderColor: 'transparent',
          borderWidth: 0,
          gapWidth: 4,
        },
        upperLabel: { show: true },
      },
      {
        // level 1
        itemStyle: {
          borderColor: 'transparent',
          borderWidth: 0,
          gapWidth: 3,
        },
      },
      {
        // level 2
        itemStyle: {
          borderColor: 'transparent',
          borderWidth: 0,
          gapWidth: 2,
        },
      },
      {
        // level 3
        itemStyle: {
          borderColor: 'transparent',
          borderWidth: 0,
          gapWidth: 1,
        },
      },
    ],
  }],
}), [treeData, breadcrumbBg, breadcrumbText]);

  /* -------------------------------------- UI ------------------------------------- */

  return (
    <Box sx={{ p: 2 }}>
      {/* Τίτλος σελίδας */}
      <Typography variant="h5" align="center" sx={{ mb: 3, fontWeight: 600 }}>
        ZSeekerDB insights
      </Typography>

      {loading && (
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Paper sx={{ p: 2 }}>
          <Typography color="error">Error: {error}</Typography>
        </Paper>
      )}

      {hasData && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' },
            alignItems: 'start',
            gap: 2
          }}
        >
          {/* --------------------------- ΚΕΝΤΡΙΚΗ ΠΕΡΙΟΧΗ --------------------------- */}
          <Box>
            {/* KPIs πάνω από το treemap (2 σειρές, ίσο μέγεθος) */}
            

{/* KPIs πάνω από το treemap – grouped */}
<Box sx={{ mb: 4, mt: 2, display: 'grid', rowGap: 1 }}>

  {/* ======== Totals ======== */}
  <Typography
    variant="subtitle2"
    sx={{
      mb: 1,
      textTransform: 'uppercase',
      letterSpacing: 0.12,
      color: 'text.secondary',
    }}
  >
    Totals
  </Typography>

  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: 'repeat(auto-fill, minmax(120px, 1fr))',
        sm: 'repeat(auto-fill, minmax(130px, 1fr))',
        md: 'repeat(auto-fill, minmax(140px, 1fr))',
      },
      gap: 1.0,   // μικρότερο gap
    }}
  >
    {[
      { title: 'Total Assemblies', value: fmtInt(totalAssemblies) },
      { title: 'Superkingdoms', value: fmtInt(totalSuperkingdoms) },
      { title: 'Kingdoms', value: fmtInt(totalKingdoms) },
      { title: 'Phyla', value: fmtInt(totalPhylum) },
      { title: 'Classes', value: fmtInt(totalClasses) },
      { title: 'Orders', value: fmtInt(totalOrders) },
      { title: 'Families', value: fmtInt(totalFamilies) },
      { title: 'Genera', value: fmtInt(totalGenus) },
      { title: 'Species', value: fmtInt(uniqueTaxids) },
    ].map((kpi) => (
      <Paper
        key={kpi.title}
        sx={{
          p: 1.5,
          py: 0.3,
          textAlign: 'center',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 1,
          minHeight: 90,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="h6"
          sx={{
            mb: 0.3,
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'primary.main',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {kpi.value}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {kpi.title}
        </Typography>
      </Paper>
    ))}
  </Box>

  {/* ======== Genome Size ======== */}
  <Typography
    variant="subtitle2"
    sx={{
      mt: 3,
      mb: 1,
      textTransform: 'uppercase',
      letterSpacing: 0.12,
      color: 'text.secondary',
    }}
  >
    Genome Size
  </Typography>

  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: 'repeat(auto-fill, minmax(140px, 1fr))',
        sm: 'repeat(auto-fill, minmax(150px, 1fr))',
      },
      gap: 1.5,
    }}
  >
    {[
      { title: 'Avg Genome', value: avgGenomeText },
      { title: 'Min Genome', value: minGenomeText },
      { title: 'Max Genome', value: maxGenomeText },
    ].map((kpi) => (
      <Paper
        key={kpi.title}
        sx={{
          p: 1.5,
          textAlign: 'center',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 1,
          minHeight: 90,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="h6"
          sx={{
            mb: 0.3,
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'primary.main',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {kpi.value}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {kpi.title}
        </Typography>
      </Paper>
    ))}
  </Box>

  {/* ======== GC % ======== */}
  <Typography
    variant="subtitle2"
    sx={{
      mt: 3,
      mb: 1,
      textTransform: 'uppercase',
      letterSpacing: 0.12,
      color: 'text.secondary',
    }}
  >
    GC%
  </Typography>

  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: 'repeat(auto-fill, minmax(140px, 1fr))',
        sm: 'repeat(auto-fill, minmax(150px, 1fr))',
      },
      gap: 1.5,
    }}
  >
    {[
      { title: 'Avg %GC', value: avgGcText },
      { title: 'Min %GC', value: minGcText },
      { title: 'Max %GC', value: maxGcText },
    ].map((kpi) => (
      <Paper
        key={kpi.title}
        sx={{
          p: 1.5,
          textAlign: 'center',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 1,
          minHeight: 90,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="h6"
          sx={{
            mb: 0.3,
            fontSize: '1.1rem',
            fontWeight: 600,
            color: 'primary.main',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {kpi.value}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
          }}
        >
          {kpi.title}
        </Typography>
      </Paper>
    ))}
  </Box>

</Box>



            {/* Treemap με διαφανές background & τετράγωνο layout */}
            <Box
              sx={{
                mx: 'auto',
                width: { xs: 'min(95vw, 70vh)', md: 'min(100%, 70vh)' },
                aspectRatio: '1 / 1',
                bgcolor: 'transparent',
              }}
            >
              <ReactECharts
                style={{ width: '100%', height: '100%' }}
                option={treemapOption}
                notMerge={true}                // <-- σημαντικό
                replaceMerge={['series']}      // <-- προαιρετικά, βοηθάει
              />

            </Box>
          </Box>

          {/* ------------------------------- ΔΕΞΙ SIDEBAR ------------------------------ */}
          <Box sx={{ 
  display: 'grid', 
  rowGap: 2, 
  position: { lg: 'sticky' as const }, 
  top: { lg: 16 } 
}}>
  {/* Superkingdoms */}
  <Paper 
    elevation={1}
    sx={{ 
      p: 3, 
      bgcolor: 'background.paper', 
      borderRadius: 2 
    }}
  >
    <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
      Assemblies in each superkingdom (counts)
    </Typography>
    {superkingdoms.map((item) => (
      <Box 
        key={item.label} 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 0.75
        }}
      >
        <Typography sx={{ color: 'text.primary' }}>
          {item.label}
        </Typography>
        <Typography 
          sx={{ 
            color: 'text.secondary',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          {fmtInt(item.n)}
        </Typography>
      </Box>
    ))}
  </Paper>

  {/* Top 5 Kingdoms */}
  <Paper 
    elevation={1}
    sx={{ 
      p: 3, 
      bgcolor: 'background.paper', 
      borderRadius: 2 
    }}
  >
    <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
      Top 5 Kingdoms
    </Typography>
    {topKingdoms.map((item) => (
      <Box 
        key={item.label} 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 0.75
        }}
      >
        <Typography sx={{ color: 'text.primary' }}>
          {item.label}
        </Typography>
        <Typography 
          sx={{ 
            color: 'text.secondary',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          {fmtInt(item.n)}
        </Typography>
      </Box>
    ))}
  </Paper>

  {/* Top 5 Genus */}
  <Paper 
    elevation={1}
    sx={{ 
      p: 3, 
      bgcolor: 'background.paper', 
      borderRadius: 2 
    }}
  >
    <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
      Top 5 Genera
    </Typography>
    {topGenus.map((item) => (
      <Box 
        key={item.label} 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 0.75
        }}
      >
        <Typography sx={{ color: 'text.primary' }}>
          {item.label}
        </Typography>
        <Typography 
          sx={{ 
            color: 'text.secondary',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          {fmtInt(item.n)}
        </Typography>
      </Box>
    ))}
  </Paper>

  {/* Assembly Levels */}
  <Paper 
    elevation={1}
    sx={{ 
      p: 3, 
      bgcolor: 'background.paper', 
      borderRadius: 2 
    }}
  >
    <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
      Assembly Levels
    </Typography>
    {assemblyLevels.map((item) => (
      <Box 
        key={item.label} 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 0.75
        }}
      >
        <Typography sx={{ color: 'text.primary' }}>
          {item.label}
        </Typography>
        <Typography 
          sx={{ 
            color: 'text.secondary',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}
        >
          {fmtInt(item.n)}
        </Typography>
      </Box>
    ))}
  </Paper>
</Box>
        </Box>
      )}
    </Box>
  );
}
