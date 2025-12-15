import type { FC, ReactNode } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Link as MuiLink,
  Divider,
  Button,
  Chip,
  useTheme,
  GridLegacy as Grid,
} from '@mui/material';

import DownloadIcon from '@mui/icons-material/Download';

// Βάση για όλα τα downloads (μπορείς να την αλλάξεις αν χρειαστεί)
const BASE_DOWNLOAD_URL = 'https://zenodo.org/api/records/17859302/draft/files/';

type Format = 'csv' | 'json' | 'parquet' | 'bed';
interface DatasetDownload {
  format: Format;
  label: string;    // Π.χ. "CSV"
  filename: string; // Π.χ. "zseeker_csv.tar.gz"
  url: string;      // Πλήρες download URL
}

interface Superkingdom {
  id: 'archaea' | 'bacteria' | 'eukaryota' | 'viruses';
  label: string;
  description: string;
  downloads: DatasetDownload[];
}

const zseeker_csv_url = `https://zenodo.org/api/records/17931949/draft/files/zseeker_csv.tar.gz/content`
const zseeker_json_url = `https://zenodo.org/api/records/17930743/draft/files/zseeker_json.tar.gz/content`
const zseeker_parquet_url = `https://zenodo.org/api/records/17928236/draft/files/zseeker_parquet.tar.gz/content`
const zseeker_bed_url = `https://zenodo.org/api/records/17935375/draft/files/zseekerdb_bed.tar.gz/content`
const zseeker_csv_file = `zseeker_csv.tar.gz`
const zseeker_json_file = `zseeker_json.tar.gz`
const zseeker_parquet_file = `zseeker_parquet.tar.gz`
const zseeker_bed_file = `zseekerdb_bed.tar.gz`

// 🔹 Ρητή δήλωση για τα full-dataset αρχεία

const FULL_DATASET_DOWNLOADS: DatasetDownload[] = [
  {
    format: 'csv',
    label: 'CSV',
    filename: zseeker_csv_file,
    url: zseeker_csv_url,
  },
  {
    format: 'json',
    label: 'JSON',
    filename: zseeker_json_file,
    url: zseeker_json_url,
  },
  {
    format: 'bed',
    label: 'BED',
    filename: zseeker_bed_file,
    url: zseeker_bed_url,
  },
  {
    format: 'parquet',
    label: 'PARQUET',
    filename: zseeker_parquet_file,
    url: zseeker_parquet_url,
  },
];

const archaea_csv_url = `https://zenodo.org/api/records/17860523/draft/files/archaea_CSV.tar.gz/content`
const bacteria_csv_url = `https://zenodo.org/api/records/17883391/draft/files/bacteria_CSV.tar.gz/content`
const eukaryota_csv_url = `https://zenodo.org/api/records/17860523/draft/files/eukaryota_CSV.tar.gz/content`
const viruses_csv_url = `https://zenodo.org/api/records/17860523/draft/files/viruses_CSV.tar.gz/content`
const archaea_csv_file = `archaea_CSV.tar.gz`
const bacteria_csv_file = `bacteria_CSV.tar.gz`
const eukaryota_csv_file = `eukaryota_CSV.tar.gz`
const viruses_csv_file = `viruses_CSV.tar.gz`

const archaea_json_url = `https://zenodo.org/api/records/17860542/draft/files/archaea_JSON.tar.gz/content`
const bacteria_json_url = `https://zenodo.org/api/records/17886344/draft/files/bacteria_JSON.tar.gz/content`
const eukaryota_json_url = `https://zenodo.org/api/records/17860542/draft/files/eukaryota_JSON.tar.gz/content`
const viruses_json_url = `https://zenodo.org/api/records/17860542/draft/files/viruses_JSON.tar.gz/content`
const archaea_json_file = `archaea_JSON.tar.gz`
const bacteria_json_file = `bacteria_JSON.tar.gz`
const eukaryota_json_file = `eukaryota_JSON.tar.gz`
const viruses_json_file = `viruses_JSON.tar.gz`

const archaea_parquet_url = `https://zenodo.org/api/records/17860595/draft/files/archaea_PARQUET.tar.gz/content`
const bacteria_parquet_url = `https://zenodo.org/api/records/17922833/draft/files/bacteria_PARQUET.tar.gz/content`
const eukaryota_parquet_url = `https://zenodo.org/api/records/17860595/draft/files/eukaryota_PARQUET.tar.gz/content`
const viruses_parquet_url = `https://zenodo.org/api/records/17860595/draft/files/viruses_PARQUET.tar.gz/content`
const archaea_parquet_file = `archaea_PARQUET.tar.gz`
const bacteria_parquet_file = `bacteria_PARQUET.tar.gz`
const eukaryota_parquet_file = `eukaryota_PARQUET.tar.gz`
const viruses_parquet_file = `viruses_PARQUET.tar.gz`

const archaea_bed_url = `https://zenodo.org/api/records/17859302/draft/files/archaea_BED.tar.gz/content`
const bacteria_bed_url = `https://zenodo.org/api/records/17859302/draft/files/bacteria_BED.tar.gz/content`
const eukaryota_bed_url = `https://zenodo.org/api/records/17859302/draft/files/eukaryota_BED.tar.gz/content`
const viruses_bed_url = `https://zenodo.org/api/records/17859302/draft/files/viruses_BED.tar.gz/content`
const archaea_bed_file = `archaea_BED.tar.gz`
const bacteria_bed_file = `bacteria_BED.tar.gz`
const eukaryota_bed_file = `eukaryota_BED.tar.gz`
const viruses_bed_file = `viruses_BED.tar.gz`

// 🔹 Ρητή δήλωση για κάθε superkingdom *και* κάθε format
const SUPERKINGDOMS: Superkingdom[] = [
  {
    id: 'archaea',
    label: 'Archaea',
    description:
      'Z-form predictions across archaeal genomes, including extremophilic lineages.',
    downloads: [
      {
        format: 'csv',
        label: 'CSV',
        filename: archaea_csv_file,
        url: archaea_csv_url,
      },
      {
        format: 'json',
        label: 'JSON',
        filename: archaea_json_file,
        url: archaea_json_url,
      },
      {
        format: 'bed',
        label: 'BED',
        filename: archaea_bed_file,
        url: archaea_bed_url,
      },
      {
        format: 'parquet',
        label: 'PARQUET',
        filename: archaea_parquet_file,
        url: archaea_parquet_url,
      },
    ],
  },
  {
    id: 'bacteria',
    label: 'Bacteria',
    description:
      'Genome-wide Z-DNA/Z-RNA candidates for bacterial model organisms and pathogens.',
    downloads: [
      {
        format: 'csv',
        label: 'CSV',
        filename: bacteria_csv_file,
        url: bacteria_csv_url,
      },
      {
        format: 'json',
        label: 'JSON',
        filename: bacteria_json_file,
        url: bacteria_json_url,
      },
      {
        format: 'bed',
        label: 'BED',
        filename: bacteria_bed_file,
        url: bacteria_bed_url,
      },
      {
        format: 'parquet',
        label: 'PARQUET',
        filename: bacteria_parquet_file,
        url: bacteria_parquet_url,
      },
    ],
  },
  {
    id: 'eukaryota',
    label: 'Eukaryota',
    description:
      'Z-form loci across fungi, plants, animals and other eukaryotic genomes.',
    downloads: [
      {
        format: 'csv',
        label: 'CSV',
        filename: eukaryota_csv_file,
        url: eukaryota_csv_url,
      },
      {
        format: 'json',
        label: 'JSON',
        filename: eukaryota_json_file,
        url: eukaryota_json_url,
      },
      {
        format: 'bed',
        label: 'BED',
        filename: eukaryota_bed_file,
        url: eukaryota_bed_url,
      },
      {
        format: 'parquet',
        label: 'PARQUET',
        filename: eukaryota_parquet_file,
        url: eukaryota_parquet_url,
      },
    ],
  },
  {
    id: 'viruses',
    label: 'Viruses',
    description:
      'Predicted Z-form regions in viral genomes, including human and animal viruses.',
    downloads: [
      {
        format: 'csv',
        label: 'CSV',
        filename: viruses_csv_file,
        url: viruses_csv_url,
      },
      {
        format: 'json',
        label: 'JSON',
        filename: viruses_json_file,
        url: viruses_json_url,
      },
      {
        format: 'bed',
        label: 'BED',
        filename: viruses_bed_file,
        url: viruses_bed_url,
      },
      {
        format: 'parquet',
        label: 'PARQUET',
        filename: viruses_parquet_file,
        url: viruses_parquet_url,
      },
    ],
  },
];

// Reusable Card component (όπως στο About)
const Card: FC<{ title?: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2.5,
      borderRadius: 2,
      bgcolor: 'background.paper',
      height: '100%',
    }}
  >
    {title && (
      <>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        <Divider sx={{ mb: 2 }} />
      </>
    )}
    {children}
  </Paper>
);

const DownloadDataset: FC = () => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        maxWidth: 1200,
        mx: 'auto',
        p: 3,
        bgcolor: 'background.default',
        color: 'text.primary',
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          Download datasets
        </Typography>
        <Chip
          label="ZSeekerDB datasets"
          size="small"
          sx={{
            fontWeight: 500,
            bgcolor:
              theme.palette.mode === 'dark'
                ? 'action.selected'
                : 'action.hover',
          }}
        />
      </Stack>

      <Grid container spacing={3}>
        {/* Intro */}
        <Grid item xs={12}>
          <Card>
            <Typography sx={{ color: 'text.secondary' }}>
              ZSeekerDB provides pre-packaged, versioned datasets of predicted
              Z-DNA and Z-RNA loci, stratified by superkingdom and offered in
              multiple formats. Use the options below to download either the
              entire dataset or specific superkingdom subsets.
            </Typography>
          </Card>
        </Grid>

        {/* Entire dataset + Notes */}
        <Grid item xs={12} md={6}>
          <Card title="Download entire dataset">
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              Download all superkingdoms in a single archive. Each format
              contains the same set of loci and metadata, optimized for
              different analysis workflows.
            </Typography>

            <Stack direction="row" spacing={1.5} flexWrap="wrap">
              {FULL_DATASET_DOWNLOADS.map((d) => (
                <Button
                  key={d.format}
                  variant="contained"
                  size="small"
                  component="a"
                  href={d.url}
                  download={d.filename}
                  startIcon={<DownloadIcon fontSize="small" />}
                  sx={{ textTransform: 'none', mb: 1 }}
                >
                  {d.label}
                </Button>
              ))}
            </Stack>

            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 2, color: 'text.secondary' }}
            >
              Filenames:
              <br />
              {FULL_DATASET_DOWNLOADS.map((d, i) => (
                <span key={d.filename}>
                  <code>{d.filename}</code>
                  {i < FULL_DATASET_DOWNLOADS.length - 1 && ', '}
                </span>
              ))}
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card title="File formats">
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                <strong>CSV</strong>: Tabular text files suitable for
                spreadsheets, scripting and general-purpose tools.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>JSON</strong>: Nested representation convenient for
                programmatic access and downstream processing.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>PARQUET</strong>: Columnar storage optimized for
                analytical workflows and big-data engines.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>BED</strong>: Genomic interval files compatible with
                standard bioinformatics tools and genome browsers.
              </Typography>
            </Stack>

            <Typography
              variant="caption"
              sx={{ display: 'block', mt: 2, color: 'text.secondary' }}
            >
              Base URL:{' '}
              <MuiLink href={BASE_DOWNLOAD_URL} target="_blank" rel="noopener">
                {BASE_DOWNLOAD_URL}
              </MuiLink>
            </Typography>
          </Card>
        </Grid>

        {/* Per superkingdom */}
        <Grid item xs={12}>
          <Card title="Download by superkingdom">
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              Use the cards below to download archives for individual
              superkingdoms. Each archive contains all Z-form loci and
              associated metadata for that superkingdom.
            </Typography>

            <Grid container spacing={3}>
              {SUPERKINGDOMS.map((sk) => (
                <Grid item xs={12} sm={6} md={3} key={sk.id}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      bgcolor: 'background.default',
                    }}
                  >
                    <Box sx={{ mb: 1.5 }}>
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 600, color: 'text.primary' }}
                      >
                        {sk.label}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.5, color: 'text.secondary' }}
                      >
                        {sk.description}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {sk.downloads.map((d) => (
                        <Button
                          key={d.format}
                          variant="outlined"
                          size="small"
                          component="a"
                          href={d.url}
                          download={d.filename}
                          startIcon={<DownloadIcon fontSize="small" />}
                          sx={{
                            textTransform: 'none',
                            mb: 1,
                            fontSize: '0.8rem',
                          }}
                        >
                          {d.label}
                        </Button>
                      ))}
                    </Stack>

                    <Typography
                      variant="caption"
                      sx={{ mt: 1, color: 'text.secondary', display: 'block' }}
                    >
                      Example filenames:
                      <br />
                      {sk.downloads.map((d, i) => (
                        <span key={d.filename}>
                          <code>{d.filename}</code>
                          {i < sk.downloads.length - 1 && ', '}
                        </span>
                      ))}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Card>
        </Grid>
      </Grid>

      {/* Footer */}
      <Box
        sx={{
          mt: 4,
          pt: 2,
          borderTop: 1,
          borderColor: 'divider',
          color: 'text.secondary',
        }}
      >
        <Typography variant="caption">
          For questions about dataset content or structure, please contact{' '}
          <MuiLink href="mailto:ilias@austin.utexas.edu">
            ilias@austin.utexas.edu
          </MuiLink>
          .
        </Typography>
      </Box>
    </Box>
  );
};

export default DownloadDataset;
