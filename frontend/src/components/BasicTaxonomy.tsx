import { useEffect, useState } from 'react';
import {
  Box,
  Autocomplete,
  TextField,
  Typography,
  CircularProgress,
} from '@mui/material';

type Tax = {
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
};

type Props = {
  superkingdom: string;
  value?: Tax; // allow optional, but we normalise below
  onChange: (v: Tax) => void;
};

async function fetchDistinct(field: string, filters: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams({ field });
  Object.entries(filters).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  const r = await fetch(`/api/metadata/distinct?${sp.toString()}`);
  const j = await r.json();
  return j?.values ?? [];
}

export default function BasicTaxonomy({ superkingdom, value, onChange }: Props) {
  // Normalise value so we always have all keys
  const safeValue: Tax = value ?? { kingdom: null, phylum: null, class: null, order: null };

  const [opts, setOpts] = useState<Record<keyof Tax, string[]>>({
    kingdom: [], phylum: [], class: [], order: [],
  });
  const [loading, setLoading] = useState<keyof Tax | null>(null);

  // Load kingdom when superkingdom changes
  useEffect(() => {
    onChange({ kingdom: null, phylum: null, class: null, order: null });
    if (!superkingdom) return;
    setLoading('kingdom');
    fetchDistinct('kingdom', { superkingdom })
      .then((data) => setOpts(o => ({ ...o, kingdom: data, phylum: [], class: [], order: [] })))
      .finally(() => setLoading(null));
  }, [superkingdom]);

  useEffect(() => {
    if (!safeValue.kingdom) return;
    setLoading('phylum');
    fetchDistinct('phylum', { superkingdom, kingdom: safeValue.kingdom })
      .then((data) => setOpts(o => ({ ...o, phylum: data, class: [], order: [] })))
      .finally(() => setLoading(null));
  }, [superkingdom, safeValue.kingdom]);

  useEffect(() => {
    if (!safeValue.phylum) return;
    setLoading('class');
    fetchDistinct('class', { superkingdom, kingdom: safeValue.kingdom, phylum: safeValue.phylum })
      .then((data) => setOpts(o => ({ ...o, class: data, order: [] })))
      .finally(() => setLoading(null));
  }, [superkingdom, safeValue.kingdom, safeValue.phylum]);

  useEffect(() => {
    if (!safeValue.class) return;
    setLoading('order');
    fetchDistinct('order', {
      superkingdom,
      kingdom: safeValue.kingdom,
      phylum: safeValue.phylum,
      class: safeValue.class,
    })
      .then((data) => setOpts(o => ({ ...o, order: data })))
      .finally(() => setLoading(null));
  }, [superkingdom, safeValue.kingdom, safeValue.phylum, safeValue.class]);

  const update = (k: keyof Tax, v: string | null) => {
    const next: Tax = { ...safeValue, [k]: v };
    if (k === 'kingdom') { next.phylum = null; next.class = null; next.order = null; }
    if (k === 'phylum') { next.class = null; next.order = null; }
    if (k === 'class') { next.order = null; }
    onChange(next);
  };

  const renderField = (label: string, key: keyof Tax, disabled = false) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="body2" sx={{ width: 100, textAlign: 'right' }}>{label}</Typography>
      <Autocomplete
        options={opts[key]}
        value={safeValue[key]}
        disabled={disabled}
        loading={loading === key}
        onChange={(_, val) => update(key, val ?? null)}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            fullWidth
            placeholder={`Select ${label.toLowerCase()}`}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading === key ? <CircularProgress size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        sx={{ width: 320 }}
      />
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        gap: 3,
        maxWidth: 1000,
        mx: 'auto',
      }}
    >
      {renderField('Kingdom', 'kingdom', !superkingdom)}
      {renderField('Phylum', 'phylum', !safeValue.kingdom)}
      {renderField('Class', 'class', !safeValue.phylum)}
      {renderField('Order', 'order', !safeValue.class)}
    </Box>
  );
}
