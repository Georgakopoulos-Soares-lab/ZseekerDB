// src/pages/HelpDocs.tsx
import { useMemo, useState, useRef, useEffect, type ReactElement } from 'react';
import {
  Box,
  Container,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Button,
  Chip,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

type Section = {
  id: string;
  title: string;
  body: ReactElement;
  defaultExpanded?: boolean;
};

export default function HelpDocs() {
  // --- Sections (fully English content) ---
  const sections: Section[] = useMemo(
    () => [
      {
        id: 'overview',
        title: 'Project Overview',
        defaultExpanded: true,
        body: (
          <>
            <Typography paragraph>
              This application is a platform for <b>exploring, filtering, and analyzing</b> Z‑DNA
              records across species by combining sequence data with rich species metadata.
            </Typography>
            <ul style={{ marginLeft: 16 }}>
              <li>
                <b>Data Exploration &amp; Visualization:</b> Interactive charts and tables to
                understand distributions and patterns.
              </li>
              <li>
                <b>Species filtering:</b> Pick a species (tax_name) and work with its available
                chromosomes/assemblies only.
              </li>
              <li>
                <b>Z‑DNA search:</b> Filters for Chromosome / Start / End / Z‑DNA Score / Sequence
                contains — with sorting & pagination.
              </li>
              <li>
                <b>Export:</b> Download query results to CSV/TSV/JSON/XML or Excel (HTML).
              </li>
            </ul>
          </>
        ),
      },
      {
        id: 'key-home',
        title: 'Key Features on the Home Page',
        body: (
          <>
            <Typography paragraph>
              Summary KPIs are presented in cards at the top. Links and shortcuts take you directly
              to the explorer and insights pages.
            </Typography>
          </>
        ),
      },
      {
        id: 'visualizations',
        title: 'Visualizations on the Insights Page',
        body: (
          <>
            <Typography paragraph>
              The taxonomic treemap is <b>interactive</b>: click a rectangle to drill down
              one available rank at a time (<i>Superkingdom → Kingdom → Phylum → Class → Order
              → Family → Genus → Species</i>). Viral lineages also include <i>Viral realm</i>.
              Missing ranks are shown as explicit <i>Unclassified …</i> nodes. Use the complete
              breadcrumb path to navigate back; each tooltip identifies the node rank and reports
              assembly and unique species-taxid counts separately.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tip: For very large categories, the treemap shows only the <b>Top‑30</b> nodes per
              level so it remains readable.
            </Typography>
            <Typography paragraph sx={{ mt: 2 }}>
              Group-level Z-DNA density, genome size and GC summaries use a two-stage
              taxid-balanced mean. Assembly values are first averaged within each species
              taxonomy identifier (NCBI species taxid); those per-taxid means are then averaged
              within the displayed taxonomic group. Each unique species taxid therefore
              contributes equally, regardless of its assembly or strain count. Assemblies with
              no predictions count with a density of 0.
            </Typography>
          </>
        ),
      },
      {
        id: 'species-explorer',
        title: 'Species Explorer & Selection',
        body: (
          <>
            <Typography paragraph>
              Start typing in the <b>Specie</b> field. Suggestions include every species in the
              release metadata, including species whose assemblies have no predicted Z-DNA (the
              results table then reports 0 Z-DNA predictions). After
              selecting a species, the <b>Chromosome</b> field is limited to chromosomes available
              in assemblies for that species.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tip: You can open the explorer with <code>?assembly=&lt;assembly_id&gt;</code> to lock
              the search to a specific assembly.
            </Typography>
          </>
        ),
      },
      {
        id: 'filters',
        title: 'Search Filters & Apply / Reset',
        body: (
          <>
            <Typography paragraph>
              Available filters: <b>Chromosome</b>, <b>Start</b> (≥, ≤), <b>End</b> (≥, ≤),
              <b> Z‑DNA Score</b> (≥, ≤) and <b>Sequence contains</b>. Click <b>APPLY</b> to run the
              query. Pagination controls are available above and below the results table.
            </Typography>
            <Typography paragraph>
              When the page is opened with <code>?assembly=...</code>, a default query runs with{' '}
              <code>"Sequence" ILIKE '%A%'</code>, sorted by <b>Z‑DNA Score</b> descending,{' '}
              <b>LIMIT 25 OFFSET 0</b>.
            </Typography>
          </>
        ),
      },
      {
        id: 'export',
        title: 'Exporting Results',
        body: (
          <>
            <Typography paragraph>
              Use the <b>Export</b> menu to download the current query results as CSV, TSV, JSON,
              XML or Excel (HTML). For very large datasets, export in batches or consider
              server‑side export.
            </Typography>
          </>
        ),
      },
      {
        id: 'viz-tab',
        title: 'Visualizations Tab',
        body: (
          <>
            <Typography paragraph>
              The tab shows six panels. With a chromosome selected (or for genomes with a single
              chromosome/contig) they describe that chromosome; otherwise they are genome‑wide.
            </Typography>
            <ul style={{ marginLeft: 16 }}>
              <li>
                <b>Z‑DNA counts:</b> number of predicted Z‑DNA sites in 10 equal bins along the
                chromosome, or one bar per chromosome genome‑wide.
              </li>
              <li>
                <b>Z‑DNA Score counts / Length counts:</b> histograms of scores (bins of 10) and
                lengths (bins of 10 bp from the 9 bp minimum).
              </li>
              <li>
                <b>Z‑DNA Score / Length distribution:</b> each prediction by genomic position (Mb)
                for one chromosome (sampled); genome‑wide, the median per chromosome, with
                min/quartiles/max on hover.
              </li>
              <li>
                <b>Length vs Score:</b> a deterministic sample of up to 20,000 predictions.
              </li>
            </ul>
            <Typography variant="body2" color="text.secondary">
              Genome‑wide panels show every chromosome up to 25; beyond that, the 12 with the most and the 12 with the fewest predictions, separated by a “…” bin.
            </Typography>
          </>
        ),
      },
      {
        id: 'faq',
        title: 'FAQ & Tips',
        body: (
          <>
            <Typography paragraph>
              <b>No results?</b> Make sure a species is selected or a valid assembly was provided
              in the URL. Loosen filters or click <b>RESET</b>.
            </Typography>
            <Typography paragraph>
              <b>Slow queries on large ranges?</b> Limit the scope with filters (Chromosome,
              Start/End, Score) or use the <b>Sequence contains</b> field to narrow the search.
            </Typography>
          </>
        ),
      },
    ],
    []
  );

  // Expand/Collapse state
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    sections.forEach(s => (init[s.id] = !!s.defaultExpanded));
    return init;
  });
  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    sections.forEach(s => (next[s.id] = value));
    setExpanded(next);
  };

  // Hash navigation
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    refs.current = Object.fromEntries(sections.map(s => [s.id, null]));
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = refs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setExpanded(prev => ({ ...prev, [id]: true }));
    history.replaceState(null, '', `#${id}`);
  };

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setExpanded(prev => ({ ...prev, [hash]: true }));
      setTimeout(() => scrollTo(hash), 0);
    }
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" align="center" sx={{ fontWeight: 700, mb: 3 }}>
        Help &amp; Documentation
      </Typography>

      {/* TOC + actions */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {sections.map(s => (
            <Chip
              key={s.id}
              label={s.title}
              onClick={() => scrollTo(s.id)}
              variant="outlined"
              clickable
              sx={{ maxWidth: 320 }}
            />
          ))}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={() => toggleAll(false)}>
            Collapse all
          </Button>
          <Button size="small" variant="contained" onClick={() => toggleAll(true)}>
            Expand all
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {/* Accordions */}
      <Box>
        {sections.map(s => (
          <Box key={s.id} ref={(el: HTMLDivElement | null) => { refs.current[s.id] = el; }}>
            <Accordion
              disableGutters
              square
              expanded={!!expanded[s.id]}
              onChange={(_, isExp) => setExpanded(prev => ({ ...prev, [s.id]: isExp }))}
              sx={{ mb: 1.5, '&:before': { display: 'none' } }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                aria-controls={`${s.id}-content`}
                id={`${s.id}-header`}
                sx={{ px: 2, bgcolor: 'background.paper', '& .MuiAccordionSummary-content': { my: 0.5 } }}
              >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {s.title}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 3, py: 2 }}>{s.body}</AccordionDetails>
            </Accordion>
          </Box>
        ))}
      </Box>
    </Container>
  );
}
