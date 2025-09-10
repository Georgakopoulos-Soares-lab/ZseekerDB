import * as React from 'react';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

export default function Brand() {
  const theme = useTheme();
  const id = React.useId(); // για μοναδικά ids στο gradient

  return (
    <Box
      component={RouterLink}
      to="/"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* DNA helix icon */}
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id={`g1-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={theme.palette.primary.main} />
            <stop offset="1" stopColor={theme.palette.secondary.main} />
          </linearGradient>
        </defs>

        {/* Καμπύλες της έλικας */}
        <path
          d="M16,8 C36,8 28,28 48,28"
          stroke={`url(#g1-${id})`}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M48,36 C28,36 36,56 16,56"
          stroke={`url(#g1-${id})`}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
        {/* «σκαλοπάτια» */}
        <g stroke={alpha(theme.palette.primary.main, 0.6)} strokeWidth="3">
          <line x1="20" y1="16" x2="44" y2="16" />
          <line x1="20" y1="26" x2="44" y2="26" />
          <line x1="20" y1="38" x2="44" y2="38" />
          <line x1="20" y1="48" x2="44" y2="48" />
        </g>
      </svg>

      {/* Λογότυπο κειμένου */}
      <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1 }}>
        Zdna
        <Typography
          component="span"
          variant="h6"
          sx={{ color: 'primary.main', fontWeight: 900, ml: 0.2 }}
        >
          DB
        </Typography>
      </Typography>
    </Box>
  );
}
