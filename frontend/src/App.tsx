import { Routes, Route, Navigate, Link as RouterLink } from 'react-router-dom'
import { Container, Paper, Typography, Button } from '@mui/material'
import AppShell from './layout/AppShell'
import Explorer from './pages/Explorer'
import Metadata from './pages/Metadata'
import MetadataStats from './pages/MetadataStats'
import DataStats from './pages/DataStats'
import HelpDocs from './pages/HelpDocs'
import Privacy from './pages/Privacy'
import About from './pages/About'

import HomeInsights from './pages/HomeInsights'   // <-- new import
import AdditionalTools from './pages/AdditionalTools'

function Home() {
  return (
    <Container maxWidth="lg">
      <Paper elevation={1} sx={{ p: 3 }}>
        <Typography variant="h4" fontWeight={800} gutterBottom>ZSeekerDB</Typography>
        <Typography paragraph>
          ZSeekerDB is a large-scale, comprehensive database cataloging predicted Z-DNA and Z-RNA sequences across all major branches of life. 
          It provides interactive search, visualization, and download options, enabling independent exploration of Z-nucleic acid data. 
          The current release includes over 280,000 genome assemblies and more than 850 million predicted Z-forming sequences. 
          ZSeekerDB fills a long-standing gap between experimental discoveries and comparative genomics of non-B DNA structures.
        </Typography>

        <Typography paragraph>
          The platform provides researchers with:
        </Typography>

        <ul style={{ marginBottom: '24px' }}>
          <li>
            <Typography paragraph>
              Filtering options across taxonomic, chromosomal, and sequence-level attributes.
            </Typography>
          </li>
          <li>
            <Typography paragraph>
              Integrated visualization tools for examining genomic distributions and patterns.
            </Typography>
          </li>
          <li>
            <Typography paragraph>
              High-performance query execution optimized for large-scale comparative genomic analyses.
            </Typography>
          </li>
          <li>
            <Typography paragraph>
              Contextualized data exploration combining sequence information with rich metadata for clearer biological interpretation.
            </Typography>
          </li>
        </ul>
        
        <Button component={RouterLink} to="/explore" variant="contained">Start exploring</Button>
      </Paper>

      {/* NEW: quick insights charts under the welcome card */}
      <HomeInsights />
    </Container>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explorer />} />
        <Route path="/metadata" element={<Metadata />} />
        <Route path="/metadatastats" element={<MetadataStats />} />
        <Route path="/data-stats" element={<DataStats />} />
        <Route path="/additional-tools" element={<AdditionalTools />} />
        <Route path="/help" element={<HelpDocs />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
