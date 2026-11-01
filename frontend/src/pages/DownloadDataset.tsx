import { Box, Typography, Paper, Stack, Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import DatasetProvenance from '../components/DatasetProvenance';
import { archive, archiveFileUrl } from '../data/archive';

export default function DownloadDataset() {
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Download datasets</Typography>
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <DatasetProvenance />
        {!archive.files.length && <Typography sx={{ mt: 2 }}>
          Dataset download links will be listed here after public availability and file checksums
          have been verified. You can export individual query results from Sequence search.
        </Typography>}
        <Button component={RouterLink} to="/explore" sx={{ mt: 2 }}>Sequence search</Button>
      </Paper>
      {(['All', 'Archaea', 'Bacteria', 'Eukaryota', 'Viruses'] as const).map(scope => {
        const files = archive.files.filter(file => file.scope === scope);
        return files.length > 0 && <Paper key={scope} variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>{scope === 'All' ? 'Entire dataset' : scope}</Typography>
          <Stack spacing={2}>
            {files.map(file => <Box key={`${file.record}:${file.filename}`}>
              <Button component="a" href={archiveFileUrl(file)} startIcon={<DownloadIcon />} variant="outlined">
                {file.format}: {file.filename}
              </Button>
              <Typography variant="caption" display="block">Checksum: {file.checksum}</Typography>
            </Box>)}
          </Stack>
        </Paper>;
      })}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>File formats and coordinates</Typography>
        <Typography paragraph>
          CSV, JSON and Parquet provide tabular prediction records. Native ZSeeker coordinates
          use zero-based starts and inclusive ends. BED coordinates are zero-based and half-open;
          the native end is increased by one during conversion. BED4 stores the assembly accession
          and unscaled ZSeeker score in its name field.
        </Typography>
        <Typography paragraph>
          Full CSV, JSON and Parquet downloads each require both parts: part 1 contains Archaea,
          Bacteria and Viruses; part 2 contains Eukaryota. Unpack the outer container and then
          its inner superkingdom archives. Assembly metadata include genomes without predictions.
        </Typography>
        <Typography paragraph>
          Only human assembly GCF_009914755.1 uses chromosome labels 1–22, X, Y for accessions
          NC_060925.1–NC_060948.1. Other assemblies and unmapped contigs retain their source identifiers.
        </Typography>
        <Typography>
          RNA-virus genomes are scored as cDNA sequences; sequence scores do not validate Z-RNA formation.
        </Typography>
      </Paper>
    </Box>
  );
}
