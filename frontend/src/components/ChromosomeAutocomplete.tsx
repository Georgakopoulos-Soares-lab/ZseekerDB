import * as React from 'react';
import { toDisplay, chromosomeSort } from '../utils/chromosomes';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';

type Props = {
  assembly?: string | null;
  value: string;
  onChange: (newValue: string) => void; // επιστρέφει την επιλεγμένη τιμή
  label?: string;
  placeholder?: string;
  limit?: number;
};

export default function ChromosomeAutocomplete({
  assembly,
  value,
  onChange,
  label = 'Chromosome',
  placeholder = 'Type to search…',
  limit = 50,
}: Props) {
  const [input, setInput] = React.useState(value);
  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const cacheRef = React.useRef<Map<string, string[]>>(new Map());

  const fetchOptions = React.useCallback(async (prefix: string) => {
    const key = `${assembly ?? ''}:${prefix.trim()}`;
    if (cacheRef.current.has(key)) { setOptions(cacheRef.current.get(key)!); return; }

    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;

    const url = `/api/zdna/distinct_chr?prefix=${encodeURIComponent(prefix.trim())}&limit=${limit}&assembly_eq=${encodeURIComponent(assembly ?? '')}`;

    try {
      setLoading(true);
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const vals: string[] = Array.isArray(json?.values) ? json.values : [];
      // dedupe (για σιγουριά) + κόψε στο limit
      const uniq = Array.from(new Set(vals.map(v => toDisplay(v, assembly)))).sort(chromosomeSort).slice(0, limit);
      cacheRef.current.set(key, uniq);
      setOptions(uniq);
    } catch (err: any) {
      if (err?.name !== 'AbortError') { console.error('distinct_chr failed:', err); setOptions([]); }
    } finally {
      setLoading(false);
    }
  }, [limit, assembly]);

  React.useEffect(() => { setInput(value); }, [value]);

  // Prefetch αρχικής λίστας
  React.useEffect(() => { fetchOptions(''); }, [fetchOptions]);
  // Server-side filtering με debounce
  React.useEffect(() => {
    const id = window.setTimeout(() => fetchOptions(input), 250);
    return () => window.clearTimeout(id);
  }, [input, fetchOptions]);

  return (
    <Autocomplete
      fullWidth
      freeSolo
      autoHighlight
      openOnFocus
      options={options}
      // Ενεργοποιούμε client-side filtering (case-insensitive)
      filterOptions={(opts) => opts.slice(0, limit)}
      loading={loading}
      loadingText="Loading…"
      noOptionsText={input ? 'No matches' : 'Start typing to see chromosomes'}
      // ΣΗΜΑΝΤΙΚΟ: ελέγχουμε χωριστά selected value και input value
      value={value || null}
      inputValue={input}
      onInputChange={(_, newInput) => setInput(newInput)}
      onChange={(_, newValue) => onChange((newValue ?? '').toString())}
      getOptionLabel={(opt) => opt}
      isOptionEqualToValue={(opt, val) => opt === val}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            endAdornment: (<>{loading ? <CircularProgress size={16} /> : null}{params.InputProps.endAdornment}</>)
          }}
        />
      )}
    />
  );
}
