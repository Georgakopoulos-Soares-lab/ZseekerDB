// frontend/src/components/RangeFilter.tsx
import { Box, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export type RangeFilterProps = {
  label: string;
  min: number | '';
  max: number | '';
  onMinChange: (v: number | '') => void;
  onMaxChange: (v: number | '') => void;
};

function normalizeToNumberOrEmpty(s: string): number | '' {
  const t = s.replace(',', '.').trim(); // allow comma as decimal
  if (t === '') return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : '';
}

export default function RangeFilter({
  label, min, max, onMinChange, onMaxChange,
}: RangeFilterProps) {
  const [minText, setMinText] = useState(min === '' ? '' : String(min));
  const [maxText, setMaxText] = useState(max === '' ? '' : String(max));

  useEffect(() => setMinText(min === '' ? '' : String(min)), [min]);
  useEffect(() => setMaxText(max === '' ? '' : String(max)), [max]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="body2" sx={{ minWidth: 130, textAlign: 'right' }}>
        {label}
      </Typography>

      <TextField
        size="small"
        placeholder="Min"
        value={minText}
        onChange={(e) => {
          const v = e.target.value;
          setMinText(v);
          onMinChange(normalizeToNumberOrEmpty(v));
        }}
        sx={{ width: 160 }}
        inputProps={{ inputMode: 'decimal' }}
      />

      <TextField
        size="small"
        placeholder="Max"
        value={maxText}
        onChange={(e) => {
          const v = e.target.value;
          setMaxText(v);
          onMaxChange(normalizeToNumberOrEmpty(v));
        }}
        sx={{ width: 160 }}
        inputProps={{ inputMode: 'decimal' }}
      />
    </Box>
  );
}
