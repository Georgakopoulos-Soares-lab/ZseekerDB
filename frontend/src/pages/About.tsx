// src/pages/About.tsx
import { FC } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Stack,
  Link as MuiLink,
  Divider,
  useTheme
} from '@mui/material';

// Reusable Card component
const Card: FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper
    variant="outlined"
    sx={{
      p: 2.5,
      borderRadius: 2,
      bgcolor: 'background.paper',
      height: '100%'
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

// Person Card component with theme-aware colors
const PersonCard: FC<{
  name: string;
  role: string;
  email: string;
}> = ({ name, role, email }) => (
  <Card>
    <Typography variant="subtitle1" sx={{ fontWeight: 500, color: 'text.primary' }}>
      {name}
    </Typography>
    <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
      {role}
    </Typography>
    <Typography variant="body2" sx={{ mt: 1, color: 'text.primary' }}>
      Email: <MuiLink href={`mailto:${email}`} color="primary">{email}</MuiLink>
    </Typography>
  </Card>
);

const AboutDoc: FC = () => {
  const theme = useTheme();
  const year = new Date().getFullYear();

  return (
    <Box sx={{ 
      maxWidth: 1200,
      mx: 'auto',
      p: 3,
      bgcolor: 'background.default',
      color: 'text.primary'
    }}>
      <Stack 
        direction="row" 
        justifyContent="space-between" 
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary' }}>
          About ZSeekerDB
        </Typography>

      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <Typography sx={{ color: 'text.secondary' }}>
              ZSeekerDB is an open, cross-species resource for discovering and comparing candidate Z-DNA and Z-RNA loci
              across organismal genomes. It combines the ZSeeker prediction framework with a versioned, analysis-oriented
              backend and a modern web interface to support rigorous, reproducible analyses.
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card title="Mission">
            <Typography color="text.secondary">
              Our mission is to make high-quality Z-form annotations broadly accessible to researchers in genomics,
              structural biology and immunology, and to support experimental prioritization with transparent methods,
              rich metadata and stable releases.
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card title="Team">
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="Ilias Georgakopoulos-Soares"
                  role="Project lead"
                  email="ilias@placeholder.edu"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="Karen M. Vasquez"
                  role="Co-principal investigator"
                  email="karen.vasquez@placeholder.edu"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="Guliang Wang"
                  role="Co-principal investigator"
                  email="guliang.wang@placeholder.edu"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="Spyros Zaranikas"
                  role="Full-stack development, data engineering"
                  email="spyros.zaranikas@placeholder.edu"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="Kimonas Provatas"
                  role="Backend engineering, data pipelines"
                  email="kimonas.provatas@placeholder.edu"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="George Megalovasilis"
                  role="Frontend engineering, visualization"
                  email="george.megalovasilis@placeholder.edu"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <PersonCard
                  name="Michail Patsakis"
                  role="Computational genomics, benchmarking"
                  email="michail.patsakis@placeholder.edu"
                />
              </Grid>
            </Grid>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card title="Affiliation">
            <Typography color="text.secondary">
              Division of Pharmacology and Toxicology, College of Pharmacy, The University of Texas at Austin,
              Dell Pediatric Research Institute, Austin, TX, USA.
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card title="Contact">
            <Typography>
              General inquiries: <MuiLink href="mailto:info@placeholder.org">info@placeholder.org</MuiLink><br />
              Project website: <MuiLink href="https://zseekerdb.com" rel="noopener">zseekerdb.com</MuiLink>
            </Typography>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card title="Funding & Acknowledgements">
            <Typography color="text.secondary">
              ZSeekerDB development is supported by NIGMS/NIH (R35GM155468) and internal institutional sources. 
              We thank members of the Georgakopoulos-Soares laboratory for valuable feedback during design and testing.
            </Typography>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ 
        mt: 4, 
        pt: 2, 
        borderTop: 1, 
        borderColor: 'divider',
        color: 'text.secondary' 
      }}>
        <Typography variant="caption">
          © {year} ZSeekerDB
        </Typography>
      </Box>
    </Box>
  );
};

export default AboutDoc;
