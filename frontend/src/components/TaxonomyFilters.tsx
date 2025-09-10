import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, CircularProgress, TextField, Typography,
} from '@mui/material';

type Props = {
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

type Field = 'superkingdom' | 'kingdom' | 'phylum' | 'class' | 'order';

async function fetchDistinct(field: string, scope: Record<string, string>) {
  const p = new URLSearchParams({ field });
  (['superkingdom','kingdom','phylum','class','order','family','genus','tax_name'] as const).forEach(k => {
    const v = scope[k];
    if (v) p.set(k, v);
  });
  const r = await fetch(`/api/metadata/distinct?${p.toString()}`);
  const j = await r.json();
  return (j?.values ?? []) as string[];
}

export function TaxonomyFilters({ values, onChange }: Props) {
  const [loadingField, setLoadingField] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<Field, string[]>>({
    superkingdom: [], kingdom: [], phylum: [], class: [], order: [],
  });

  const scopeFor = useMemo(() => ({
    superkingdom: {},
    kingdom: { superkingdom: values.superkingdom },
    phylum: { superkingdom: values.superkingdom, kingdom: values.kingdom },
    class:  { superkingdom: values.superkingdom, kingdom: values.kingdom, phylum: values.phylum },
    order:  { superkingdom: values.superkingdom, kingdom: values.kingdom, phylum: values.phylum, class: values.class },
  }), [values]);

  useEffect(() => {
    (async () => {
      setLoadingField('superkingdom');
      const data = await fetchDistinct('superkingdom', {});
      setOptions((o) => ({ ...o, superkingdom: data }));
      setLoadingField(null);
    })();
  }, []);

  const loadField = async (f: Field) => {
    setLoadingField(f);
    const data = await fetchDistinct(f, scopeFor[f]);
    setOptions((o) => ({ ...o, [f]: data }));
    setLoadingField(null);
  };

  const setVal = (k: Field, v: string | null) => {
    const next = { ...values, [k]: v || '' };
    if (k === 'superkingdom') {
      next.kingdom = ''; next.phylum = ''; next.class = ''; next.order = '';
    } else if (k === 'kingdom') {
      next.phylum = ''; next.class = ''; next.order = '';
    } else if (k === 'phylum') {
      next.class = ''; next.order = '';
    } else if (k === 'class') {
      next.order = '';
    }
    onChange(next);
  };

  const renderAuto = (label: string, field: Field, disabled = false) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Typography variant="body2" sx={{ width: 120, textAlign: 'right' }}>{label}</Typography>
      <Autocomplete
        value={values[field] || null}
        onChange={(_, v) => setVal(field, v)}
        onFocus={() => loadField(field)}
        options={options[field] || []}
        loading={loadingField === field}
        disabled={disabled}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            placeholder="Select..."
            fullWidth
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loadingField === field ? <CircularProgress size={16} /> : null}
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
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 3,
        maxWidth: 1000,
        mx: 'auto',
      }}
    >
      {renderAuto('Kingdom', 'kingdom', !values.superkingdom)}
      {renderAuto('Phylum', 'phylum', !values.kingdom)}
      {renderAuto('Class', 'class', !values.phylum)}
      {renderAuto('Order', 'order', !values.class)}
    </Box>
  );
}
