import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ReactECharts from 'echarts-for-react';
import {
  buildTaxonomyTree,
  type TaxonomyTreeRow,
  type TreeNode,
} from '../utils/taxonomyTree';
import {
  TREEMAP_MIN_VISIBLE_AREA,
  TREEMAP_SERIES_BOUNDS,
} from '../utils/treemapLayout';
import { VIZ_FONT, VIZ_MUI_FONT } from '../utils/visualizationTypography';

/* =============================================================================
   helpers
   ========================================================================== */

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

/** Βασική παλέτα superkingdoms (ίδια με home / metadata) */
const SUPERKINGDOM_COLORS = ['#4D77A9', '#F08F2A', '#E25558', '#77B7B3'] as const;

/** Κανονικοποίηση superkingdom σε 4 σταθερές κατηγορίες */
const SK_ORDER = ['Archaea', 'Bacteria', 'Eukaryota', 'Viruses'] as const;
type SK = typeof SK_ORDER[number];

/** Σταθερό χρώμα ανά superkingdom */
const SK_COLOR: Record<SK, string> = {
  Archaea: SUPERKINGDOM_COLORS[0],
  Bacteria: SUPERKINGDOM_COLORS[1],
  Eukaryota: SUPERKINGDOM_COLORS[2],
  Viruses: SUPERKINGDOM_COLORS[3],
};


function canonSK(s: string | null): SK | null {
  const x = (s ?? '').trim().toLowerCase();
  if (x === 'archaea') return 'Archaea';
  if (x === 'bacteria') return 'Bacteria';
  if (x === 'eukaryota' || x === 'eukaryotes' || x === 'eukaryote') return 'Eukaryota';
  if (x === 'viruses' || x === 'virus') return 'Viruses';
  return null; // κρατάμε αυστηρά τα 4
}

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
  const treemapChartRef = useRef<ReactECharts>(null);
  const treemapContainerRef = useRef<HTMLDivElement>(null);

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
            COUNT(DISTINCT taxid)                   AS unique_taxids,
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

        // 6) Full rank-by-rank drill-down distribution.
        const distSql = `
          SELECT
            superkingdom,
            viral_realm,
            kingdom,
            phylum,
            class,
            "order",
            family,
            genus,
            tax_name,
            taxid,
            COUNT(*) AS assembly_count
          FROM metadata
          WHERE genome_size >= 1000
          GROUP BY 1,2,3,4,5,6,7,8,9,10
        `;
        const dist = await fetchSql<TaxonomyTreeRow>(distSql);

        if (cancelled) return;

        setTotalAssemblies(Number(ov?.total_assemblies ?? null));
        setUniqueTaxids(Number(ov?.unique_taxids ?? null));
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

        const canonicalRows = dist.flatMap(row => {
          const superkingdom = canonSK(row.superkingdom);
          return superkingdom ? [{ ...row, superkingdom }] : [];
        });
        const built = buildTaxonomyTree(canonicalRows);
        const bySuperkingdom = new Map(built.map(node => [node.name, node]));
        const data = SK_ORDER.flatMap(superkingdom => {
          const node = bySuperkingdom.get(superkingdom);
          return node
            ? [{ ...node, itemStyle: { color: SK_COLOR[superkingdom] } }]
            : [];
        });
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

  useEffect(() => {
    const container = treemapContainerRef.current;
    if (!hasData || !container) return;

    let frame = 0;
    const resizeTreemap = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        treemapChartRef.current?.getEchartsInstance().resize();
      });
    };

    const observer = new ResizeObserver(resizeTreemap);
    observer.observe(container);
    resizeTreemap();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [hasData]);

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
    textStyle: { fontSize: VIZ_FONT.base },

    tooltip: {
      formatter: (info: any) => {
        const node = info.data as TreeNode;
        const path = (info.treePathInfo ?? [])
          .map((part: { name?: string }) => part.name)
          .filter(Boolean)
          .join(' › ');
        return [
          `<strong>${node.name}</strong>`,
          `Rank: ${node.rank}`,
          `Assemblies: ${fmtInt(node.assemblyCount)}`,
          `Unique taxids: ${fmtInt(node.uniqueTaxids)}`,
          path ? `Path: ${path}` : '',
        ].filter(Boolean).join('<br/>');
      },
      textStyle: { fontSize: VIZ_FONT.defaultTooltip },
    },
    series: [{
      name: 'Taxonomy',
      type: 'treemap',
      data: treeData,
      ...TREEMAP_SERIES_BOUNDS,
      leafDepth: 1,
      nodeClick: 'zoomToNode',
      roam: false,
      visibleMin: TREEMAP_MIN_VISIBLE_AREA,
      childrenVisibleMin: TREEMAP_MIN_VISIBLE_AREA,
      squareRatio: 0.9,
      colorMappingBy: 'index',

      // labels
      label: {
        show: true,
        formatter: '{b}',
        color: isDarkMode ? '#ffffff' : '#111111',   // 👈 ΔΥΝΑΜΙΚΟ ΧΡΩΜΑ
        overflow: 'truncate',
        fontSize: VIZ_FONT.treemapLabel,
        minFontSize: VIZ_FONT.treemapMin,
      },

      upperLabel: {
        show: true,
        height: 35,
        color: isDarkMode ? '#ffffff' : '#111111',   // 👈 ΔΥΝΑΜΙΚΟ ΧΡΩΜΑ
        formatter: '{b}',
        textStyle: {
          fontSize: VIZ_FONT.treemapHeader,
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
        height: 35,
        left: 'center',
        bottom: 4,
        itemStyle: {
          color: breadcrumbBg,       // από το theme (dark / light)
          borderColor: 'transparent',
        },
        textStyle: {
          color: breadcrumbText,     // π.χ. #FFFFFF
          fontSize: VIZ_FONT.base,
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
        { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 1 } },
        { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 1 } },
        { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 1 } },
        { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 1 } },
        { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 1 } },
        { itemStyle: { borderColor: 'transparent', borderWidth: 0, gapWidth: 1 } },
      ],
    }],
  }), [treeData, breadcrumbBg, breadcrumbText, isDarkMode]);

  /* -------------------------------------- UI ------------------------------------- */

  return (
    <Box sx={{ p: 2 }}>
      {/* Τίτλος σελίδας */}
      <Typography
        variant="h5"
        align="center"
        sx={{ mb: 3, fontWeight: 600, fontSize: VIZ_MUI_FONT.pageTitle }}
      >
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
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px' },
            alignItems: 'start',
            gap: 2
          }}
        >
          {/* --------------------------- ΚΕΝΤΡΙΚΗ ΠΕΡΙΟΧΗ --------------------------- */}
          <Box sx={{ minWidth: 0, width: '100%' }}>
            {/* KPIs πάνω από το treemap (2 σειρές, ίσο μέγεθος) */}


            {/* KPIs πάνω από το treemap – grouped */}
            <Box sx={{ mb: 4, mt: 2, display: 'grid', rowGap: 1 }}>

              {/* ======== Totals ======== */}
              <Typography
                variant="subtitle2"
                sx={{
                  mb: 1,
                  fontSize: VIZ_MUI_FONT.sectionTitle,
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
                  { title: 'Unique taxids', value: fmtInt(uniqueTaxids) },
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
                        fontSize: VIZ_MUI_FONT.metric,
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
                        fontSize: VIZ_MUI_FONT.caption,
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
                  fontSize: VIZ_MUI_FONT.sectionTitle,
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
                        fontSize: VIZ_MUI_FONT.metric,
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
                        fontSize: VIZ_MUI_FONT.caption,
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
                  fontSize: VIZ_MUI_FONT.sectionTitle,
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
                        fontSize: VIZ_MUI_FONT.metric,
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
                        fontSize: VIZ_MUI_FONT.caption,
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
              ref={treemapContainerRef}
              data-testid="taxonomy-treemap-container"
              sx={{
                mx: 'auto',
                width: '100%',
                maxWidth: '70vh',
                minWidth: 0,
                aspectRatio: '1 / 1',
                bgcolor: 'transparent',
                overflow: 'hidden',
              }}
            >
              <ReactECharts
                ref={treemapChartRef}
                style={{ width: '100%', height: '100%' }}
                option={treemapOption}
                notMerge={true}                // <-- σημαντικό
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
              <Typography
                variant="h6"
                sx={{ mb: 2, fontWeight: 500, fontSize: VIZ_MUI_FONT.cardTitle }}
              >
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
                      fontSize: VIZ_MUI_FONT.sidebarCount
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
              <Typography
                variant="h6"
                sx={{ mb: 2, fontWeight: 500, fontSize: VIZ_MUI_FONT.cardTitle }}
              >
                Top 5 kingdoms by assemblies
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
                      fontSize: VIZ_MUI_FONT.sidebarCount
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
              <Typography
                variant="h6"
                sx={{ mb: 2, fontWeight: 500, fontSize: VIZ_MUI_FONT.cardTitle }}
              >
                Top 5 genera by assemblies
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
                      fontSize: VIZ_MUI_FONT.sidebarCount
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
              <Typography
                variant="h6"
                sx={{ mb: 2, fontWeight: 500, fontSize: VIZ_MUI_FONT.cardTitle }}
              >
                Assembly levels (assembly counts)
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
                      fontSize: VIZ_MUI_FONT.sidebarCount
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
