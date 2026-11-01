import { Box, Typography, Paper, Stack, Button, Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import DatasetProvenance from '../components/DatasetProvenance';
import {
  archive, archiveFileUrl, archiveRecordUrl, archiveFileLabel, archiveFileSize,
} from '../data/archive';

export default function DownloadDataset() {
  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Download datasets</Typography>
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <DatasetProvenance />
        <Typography sx={{ mt: 2 }}>
          Download the public October 2026 datasets below. All {archive.files.length} direct download
          links and file sizes were checked without authentication on {archive.verifiedAt}.
          Each file lists its Zenodo record, DOI and published MD5 checksum.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          The published records report {archive.publishedAssemblies.toLocaleString()} assemblies and{' '}
          {archive.publishedPredictions.toLocaleString()} predictions. The portal catalog above contains{' '}
          {archive.assemblies.toLocaleString()} assemblies and {archive.predictions.toLocaleString()} predictions.
          Use the metadata bundled with each archive for its assembly attributes and counts.
        </Typography>
        <Button component={RouterLink} to="/explore" sx={{ mt: 2 }}>Sequence search</Button>
      </Paper>
      {(['All', 'Archaea', 'Bacteria', 'Eukaryota', 'Viruses'] as const).map(scope => {
        const files = archive.files.filter(file => file.scope === scope);
        return files.length > 0 && <Paper key={scope} variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>{scope === 'All' ? 'Entire dataset' : scope}</Typography>
          {scope === 'All' && <Typography sx={{ mb: 2 }}>
            Download both parts of your chosen CSV, JSON or Parquet format. BED is a single archive.
          </Typography>}
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
            {files.map(file => <Box key={`${file.record}:${file.filename}`}>
              <Button component="a" href={archiveFileUrl(file)} startIcon={<DownloadIcon />} variant="contained"
                aria-label={`Download ${scope === 'All' ? 'entire dataset' : scope} ${archiveFileLabel(file)}`}>
                {archiveFileLabel(file)} · {archiveFileSize(file.bytes)}
              </Button>
              <Stack spacing={0.5} sx={{ mt: 1, overflowWrap: 'anywhere' }}>
                <Typography variant="caption">{file.filename}</Typography>
                <Typography variant="caption">
                  <Link href={archiveRecordUrl(file)}>Zenodo record {file.record}</Link>{' · '}
                  <Link href={`https://doi.org/10.5281/zenodo.${file.record}`}>DOI</Link>
                </Typography>
                <Box component="details">
                  <Typography component="summary" variant="caption" sx={{ cursor: 'pointer' }}>MD5 checksum</Typography>
                  <Typography component="code" variant="caption">{file.checksum.replace('md5:', '')}</Typography>
                </Box>
              </Stack>
            </Box>)}
          </Box>
        </Paper>;
      })}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>File formats and coordinates</Typography>
        <Typography paragraph>
          CSV, JSON and Parquet archives provide prediction tables and assembly metadata.
          Native ZSeeker coordinates use zero-based starts and inclusive ends.
        </Typography>
        <Typography paragraph>
          Full CSV, JSON and Parquet downloads are split by assembly accession. Both parts are
          needed for the complete dataset; each part includes the complete metadata file.
          Extract the .tar.gz archives to access their data and metadata tables.
        </Typography>
        <Typography paragraph>
          The published BED files contain chromosome, start, native inclusive end and raw
          ZSeeker score. Add one to the end before using them as standard half-open BED.
          For example, the archived locus CP115555.1:605–655 spans 51 bp and becomes 605–656
          in half-open BED coordinates. The fourth column contains the raw score.
        </Typography>
        <Typography paragraph>
          Archived chromosome accessions are preserved. The portal displays chromosomes 1–22, X, Y
          for human assembly GCF_009914755.1; other assemblies and unmapped contigs retain their identifiers.
        </Typography>
        <Typography>
          RNA-virus genomes are scored as cDNA sequences; sequence scores do not validate Z-RNA formation.
        </Typography>
      </Paper>
    </Box>
  );
}
