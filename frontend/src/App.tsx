import { Routes, Route, Navigate, Link as RouterLink } from 'react-router-dom'
import { Container, Paper, Typography, Button } from '@mui/material'
import AppShell from './layout/AppShell'
import Explorer from './pages/Explorer'
import Metadata from './pages/Metadata'
import MetadataStats from './pages/MetadataStats'
import DataStats from './pages/DataStats'
import HelpDocs from './pages/HelpDocs'
import HomeInsights from './pages/HomeInsights'   // <-- new import

function Home() {
  return (
    <Container maxWidth="lg">
      <Paper elevation={1} sx={{ p: 3 }}>
        <Typography variant="h4" fontWeight={800} gutterBottom>Welcome</Typography>
        <Typography paragraph>
          This project is based on an extensive genomic dataset comprising billions of DNA sequence records, 
          systematically linked with assembly-level metadata such as taxonomic classification, assembly identifiers, 
          and chromosomal information. The dataset has been curated to enable large-scale investigation of 
          genomic regions with potential Z-DNA conformational properties.
        </Typography>

        <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>
          The platform provides researchers with:
        </Typography>

        <ul style={{ marginBottom: '24px' }}>
          <li>
            <Typography paragraph>
              Comprehensive filtering capabilities across taxonomic, chromosomal, and sequence-level attributes.
            </Typography>
          </li>
          <li>
            <Typography paragraph>
              Integrated visualization and statistical tools for examining genomic distributions and patterns.
            </Typography>
          </li>
          <li>
            <Typography paragraph>
              Optimized high-performance query execution designed to support analyses at the scale of millions of chromosomes.
            </Typography>
          </li>
          <li>
            <Typography paragraph>
              Contextualized data exploration that combines sequence information with rich metadata for deeper biological interpretation.
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
        <Route path="/help" element={<HelpDocs />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
