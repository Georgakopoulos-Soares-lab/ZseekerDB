import { Routes, Route, Navigate, Link as RouterLink } from 'react-router-dom'
import { Container, Paper, Typography, Button } from '@mui/material'
import AppShell from './layout/AppShell'
import Explorer from './pages/Explorer'
import Metadata from './pages/Metadata'
import MetadataStats from './pages/MetadataStats'
import DataStats from './pages/DataStats'

function Home() {
  return (
    <Container maxWidth="lg">
      <Paper elevation={1} sx={{ p: 3 }}>
        <Typography variant="h4" fontWeight={800} gutterBottom>Welcome</Typography>
        <Typography paragraph>
          Explore Z-DNA candidates, browse metadata and run ad‑hoc SELECT queries.
        </Typography>
        <Button component={RouterLink} to="/explore" variant="contained">Start exploring</Button>
      </Paper>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
