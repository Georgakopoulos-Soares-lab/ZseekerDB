import { Typography, Link, Stack } from '@mui/material';
import { archive } from '../data/archive';

export default function DatasetProvenance() {
  return <Stack spacing={1}>
    <Typography color="text.secondary">
      {archive.buildDate && <>Dataset built {archive.buildDate}; {archive.assemblies?.toLocaleString()} assemblies and{' '}
      {archive.predictions?.toLocaleString()} predicted loci.</>}
    </Typography>
    <Typography color="text.secondary">
      {archive.speciesTaxids != null && <>{archive.speciesTaxids.toLocaleString()} species grouping identifiers. </>}
      {archive.assemblies != null && archive.predictionBearingAssemblies != null && <>
        {archive.predictionBearingAssemblies.toLocaleString()} assemblies have predictions;{' '}
        {(archive.assemblies - archive.predictionBearingAssemblies).toLocaleString()} have none and remain included in the assembly totals.
      </>}
    </Typography>
    <Typography color="text.secondary">
      {archive.doi && archive.files.length > 0
        ? <Link href={`https://doi.org/${archive.doi}`}>Dataset DOI: {archive.doi}</Link>
        : <>Public dataset archive: verification pending.</>}
    </Typography>
    {archive.metadataSha256 && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
      Metadata SHA-256: <code>{archive.metadataSha256}</code>
    </Typography>}
  </Stack>;
}
