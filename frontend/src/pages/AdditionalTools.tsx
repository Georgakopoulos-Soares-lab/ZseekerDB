// src/pages/ZSeeker.tsx
import type { FC } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Link as MuiLink,
  Divider,
  Button,
  List,
  ListItem,
  ListItemText
} from '@mui/material';

// Reusable section component
const Section: FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper
    variant="outlined"
    sx={(theme) => ({
      p: 2.5,
      borderRadius: 2,
      borderColor: theme.palette.divider,
      bgcolor: 'background.paper',
      mb: 2.5
    })}
  >
    <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
      {title}
    </Typography>
    <Divider sx={{ mb: 2 }} />
    {children}
  </Paper>
);

const AddtionalTools: FC = () => {
  return (
    <Box
      sx={{
        maxWidth: 1000,
        mx: 'auto',
        p: 3,
        color: 'text.primary'
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Typography variant="h5" fontWeight={700}>
          ZSeeker – Additional Tool
        </Typography>

      </Stack>

      {/* Open Tool Button */}
      <Paper
        variant="outlined"
        sx={{
          p: 2.5,
          mb: 3,
          textAlign: 'center',
          borderRadius: 2,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="body1" sx={{ mb: 2 }}>
          Try the live ZSeeker tool for identifying potential Z-DNA-forming regions:
        </Typography>
        <Button
          variant="contained"
          color="primary"
          size="large"
          href="https://zseeker.netlify.app/"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ fontWeight: 600 }}
        >
          Open ZSeeker (Netlify)
        </Button>
      </Paper>

      {/* Sections */}
      <Section title="Project Description">
        <Typography paragraph>
          <strong>ZSeeker</strong> is a research-oriented application that scans DNA sequences to highlight regions
          with elevated likelihood to adopt the left-handed <em>Z-DNA</em> conformation. By combining sequence-pattern
          analysis with a configurable scoring system, it enables rapid, reproducible screening of candidate loci that
          may influence gene regulation and genomic stability.
        </Typography>
      </Section>

      <Section title="What is Z-DNA?">
        <Typography paragraph>
          Z-DNA is an alternative left-handed DNA conformation, distinct from the common right-handed B-DNA structure.
          Its zigzag backbone arises from specific nucleotide sequences and supercoiling stresses. Z-DNA formation has
          been associated with biological processes such as gene regulation and genomic instability, and can influence
          transcription and recombination events.
        </Typography>
      </Section>

      <Section title="About the Tool">
        <Typography paragraph>
          The ZSeeker tool detects potential Z-DNA-forming regions within DNA sequences. It analyzes nucleotide patterns
          and applies a specialized scoring system to flag regions likely to undergo a B-DNA → Z-DNA transition. This
          helps researchers prioritize genomic segments that could modulate gene expression, contribute to genetic
          instability, or participate in other Z-DNA–influenced functions.
        </Typography>
      </Section>

      <Section title="Algorithm Overview">
        <Typography paragraph>
          ZSeeker scans sequences to identify candidate Z-DNA regions by recognizing informative dinucleotide patterns
          and combining <strong>scores</strong> and <strong>penalties</strong>. The core heuristic emphasizes transitions
          known to favor Z-DNA while suppressing long patterns that are unlikely to support the conformation.
        </Typography>
      </Section>

      <Section title="Penalty Mechanisms">
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          1) Dinucleotide Interruption Penalties
        </Typography>
        <Typography paragraph>
          Applied when a dinucleotide deviates from expected patterns (<code>GC, CG, GT, TG, AC, CA, AT, TA</code>).
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Linear penalty"
              secondary="Increases linearly with each consecutive mismatch (e.g., first −1.0, second −3.0, etc.)."
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Exponential penalty"
              secondary="Increases exponentially (with an upper cap) to quickly suppress runs of mismatches."
            />
          </ListItem>
        </List>

        <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>
          2) Consecutive AT Penalties
        </Typography>
        <Typography paragraph>
          While AT/TA pairs can contribute to Z-DNA formation, long consecutive stretches are unfavorable. The algorithm
          assigns bonuses for initial AT/TA pairs and increases penalties for consecutive occurrences beyond a threshold
          (default penalty array: <code>0.5, 0.5, 0.5, 0.5, 0.0, 0.0, -5.0, -100.0</code>).
        </Typography>
      </Section>

      <Section title="Key Parameters">
        <List dense>
          <ListItem><ListItemText primary="--fasta" secondary="Path to the input FASTA file." /></ListItem>
          <ListItem><ListItemText primary="--GC_weight" secondary="Weight for GC/CG transitions (Default: 7.0)." /></ListItem>
          <ListItem><ListItemText primary="--AT_weight" secondary="Weight for AT/TA transitions (Default: 0.5)." /></ListItem>
          <ListItem><ListItemText primary="--GT_weight" secondary="Weight for GT/TG transitions (Default: 1.25)." /></ListItem>
          <ListItem><ListItemText primary="--AC_weight" secondary="Weight for AC/CA transitions (Default: 1.25)." /></ListItem>
          <ListItem><ListItemText primary="--mismatch_penalty_starting_value" secondary="Initial penalty for a non purine/pyrimidine transition (Default: 3)." /></ListItem>
          <ListItem><ListItemText primary="--mismatch_penalty_linear_delta" secondary="Linear rate of increase for each subsequent mismatch (Default: 3)." /></ListItem>
          <ListItem><ListItemText primary="--mismatch_penalty_type" secondary="Scaling method: linear or exponential (Default: linear)." /></ListItem>
          <ListItem><ListItemText primary="--n_jobs" secondary="Threads to use (Default: -1, uses all available CPUs)." /></ListItem>
          <ListItem><ListItemText primary="--threshold" secondary="Score threshold for identifying Z-DNA candidates (Default: 50)." /></ListItem>
          <ListItem><ListItemText primary="--consecutive_AT_scoring" secondary="Penalty array for consecutive AT repeats (Default: (0.5,0.5,0.5,0.5,0.0,0.0,-5.0,-100.0))." /></ListItem>
          <ListItem><ListItemText primary="--display_sequence_score" secondary="Display total sequence score (0/1)." /></ListItem>
          <ListItem><ListItemText primary="--output_dir" secondary="Directory where output files are stored." /></ListItem>
          <ListItem><ListItemText primary="--gff_file" secondary="Optional GFF file for annotation (uses 'gene' features only)." /></ListItem>
          <ListItem><ListItemText primary="--drop_threshold" secondary="Drop threshold for subarray detection (lower = smaller regions, higher = fewer larger ones)." /></ListItem>
          <ListItem><ListItemText primary="--total_sequence_scoring" secondary="If set, calculates total score for full sequences instead of subsequences." /></ListItem>
        </List>
      </Section>

      <Section title="Applications">
        <Typography paragraph>
          ZSeeker assists researchers in identifying genomic regions with potential Z-DNA-forming capabilities, which
          can influence gene expression regulation, genomic stability, and more. This enables targeted experimental
          designs and deeper insights into DNA conformational dynamics.
        </Typography>
      </Section>
    </Box>
  );
};

export default AddtionalTools;
