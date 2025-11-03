// src/pages/Privacy.tsx
import { FC } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Link as MuiLink,
  Divider
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

const Privacy: FC = () => {
  const now = new Date();
  const year = now.getFullYear();
  const lastUpdated = new Intl.DateTimeFormat('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: '2-digit' 
  }).format(now);

  return (
    <Box sx={{ 
      maxWidth: 1000,
      mx: 'auto',
      p: 3,
      color: 'text.primary'
    }}>
      <Stack 
        direction="row" 
        justifyContent="space-between" 
        alignItems="center"
        sx={{ mb: 3 }}
      >
        <Typography variant="h5" fontWeight={700}>
          Privacy Policy
        </Typography>
        <Stack direction="row" spacing={2}>
          <MuiLink href="/" underline="hover">Home</MuiLink>
          <MuiLink href="/about" underline="hover">About</MuiLink>
          <MuiLink href="/downloads" underline="hover">Downloads</MuiLink>
          <MuiLink href="/api" underline="hover">API</MuiLink>
        </Stack>
      </Stack>

      <Section title="Overview">
        <Typography color="text.secondary">
          ZSeekerDB is committed to protecting your privacy and safeguarding the information we process in connection with your use of this site and services. This Privacy Notice explains what data we collect, how we use and protect it, with whom we may share it, and the rights available to you. Our licensing terms follow the <strong>Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International (CC BY‑NC‑SA 4.0)</strong> license for database content, unless otherwise indicated for specific datasets.
        </Typography>
      </Section>


      <Section title="Data we collect">
        <Typography color="text.secondary">
          We design ZSeekerDB to operate with minimal personal data.
        </Typography>
        <dl>
          <dt>Technical event and server logs</dt>
          <dd>When you access the site, our servers may automatically record standard log information such as IP address, user‑agent, timestamps, requested URLs, and HTTP status codes. We use this data to ensure availability, prevent abuse, troubleshoot issues, and produce aggregate usage statistics.</dd>
          <dt>Cookies</dt>
          <dd>We use only essential cookies necessary for core functionality (e.g., session continuity, security). We do not use third‑party marketing cookies. If optional analytics are enabled, a separate notice and opt‑in banner will be presented.</dd>
          <dt>Analytics (optional)</dt>
          <dd>If privacy‑preserving analytics are enabled, we collect aggregate metrics regarding page views and feature usage. IP addresses are either not stored or are anonymized, and we do not build profiles or track users across sites. You may opt out at any time via the cookie banner (when present).</dd>
          <dt>Contact information</dt>
          <dd>If you contact us by email, we will process the information you provide to respond to your inquiry. We do not require account creation and do not accept user‑uploaded genomic data through the portal.</dd>
        </dl>
      </Section>


      <Section title="How we use data">
        <Typography color="text.secondary">
          We use the data described above to operate, maintain, and secure the service; to understand and improve performance; and to respond to communications. We do not sell personal data and do not use it for advertising or profiling.
        </Typography>
      </Section>


      <Section title="Legal bases (EEA/UK users)">
        <Typography color="text.secondary">
          Where the EU/UK data protection laws apply, our processing relies on the following legal bases: provision of the service and security (legitimate interests, Art. 6(1)(f) GDPR); compliance with legal obligations (Art. 6(1)(c)); and, where applicable, consent for non‑essential cookies or analytics (Art. 6(1)(a)).
        </Typography>
      </Section>


      <Section title="Retention">
        <Typography color="text.secondary">
          Server logs are retained for up to <strong>30 days</strong> unless a longer period is required for security investigations or to comply with legal obligations. Communications sent to our contact address are retained for as long as necessary to handle your request and for reasonable archival purposes.
        </Typography>
      </Section>


      <Section title="Security measures">
        <Typography color="text.secondary">
          We employ technical and organizational measures aligned with industry practices, including enforced HTTPS, access controls based on least privilege, audit logging for administrative actions, regular dependency patching, encrypted backups, and periodic reviews of infrastructure configurations. While no online service can guarantee absolute security, we strive to mitigate risks proportionately and remediate vulnerabilities promptly.
        </Typography>
      </Section>


      <Section title="Sharing and processors">
        <Typography color="text.secondary">
          We may share limited data with service providers acting on our behalf and under written agreements (e.g., hosting, error monitoring, privacy‑preserving analytics if enabled). These providers are bound by confidentiality and data protection obligations and may process data only as instructed by us. We do not otherwise disclose personal data except as required by law or to protect the rights, safety, and integrity of our users and services.
        </Typography>
      </Section>


      <Section title="International transfers">
        <Typography color="text.secondary">
          Given the global nature of the internet and our infrastructure, data may be processed in countries outside your jurisdiction. Where the GDPR applies and data are transferred outside the EEA/UK, we rely on appropriate safeguards such as Standard Contractual Clauses, as applicable.
        </Typography>
      </Section>


      <Section title="Your rights">
        <Typography color="text.secondary">
          Depending on your location, you may have rights to access, correct, delete, restrict, or object to the processing of your personal data, and to data portability. If processing is based on consent, you may withdraw consent at any time. To exercise your rights, contact us at <a href="mailto:privacy@placeholder.org">privacy@placeholder.org</a>. You also have the right to lodge a complaint with a supervisory authority in your country of residence or work.
        </Typography>
      </Section>


      <Section title="Children">
        <Typography color="text.secondary">
          ZSeekerDB is intended for use by researchers and is not directed to children. We do not knowingly collect personal data from anyone under the age required by applicable law. If you believe a child has provided us with personal data, please contact us so we can take appropriate action.
        </Typography>
      </Section>


      <Section title="Licensing">
        <Typography color="text.secondary">
          Unless otherwise noted for specific third‑party datasets, the ZSeekerDB database content is made available under the <strong>Creative Commons Attribution–NonCommercial–ShareAlike 4.0 International (CC BY‑NC‑SA 4.0)</strong> license. You are free to share and adapt the material for non‑commercial purposes, provided that you give appropriate credit, indicate if changes were made, and distribute your contributions under the same license. For the full legal code and a human‑readable summary, see the Creative Commons website.
        </Typography>
        <Typography className="legal" variant="body2" color="text.secondary">
          Summary: CC BY‑NC‑SA 4.0 — Attribution required; Non‑Commercial use only; Share‑Alike; No additional restrictions beyond the license. This license does not supersede rights granted by applicable exceptions and limitations, nor does it affect third‑party rights not owned by ZSeekerDB.
        </Typography>
      </Section>


      <Section title="Contact">
        <Typography color="text.secondary">
          For privacy questions or requests, contact our team at <a href="mailto:privacy@placeholder.org">privacy@placeholder.org</a>. If you require a Data Protection Officer contact, please use <a href="mailto:dpo@placeholder.org">dpo@placeholder.org</a>.
        </Typography>
        <Typography className="kvs" variant="body2" color="text.secondary">
          Controller: ZSeekerDB Project Team, Division of Pharmacology and Toxicology, College of Pharmacy, The University of Texas at Austin, Dell Pediatric Research Institute, Austin, TX, USA.
        </Typography>
        <Typography className="kvs" variant="body2" color="text.secondary">
          Last updated: {lastUpdated}
        </Typography>
      </Section>


      <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">
          © {year} ZSeekerDB • Last updated: {lastUpdated}
        </Typography>
      </Box>
    </Box>
  );
};

export default Privacy;
