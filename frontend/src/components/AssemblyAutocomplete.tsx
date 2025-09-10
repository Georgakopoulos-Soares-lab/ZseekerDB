import * as React from 'react';
import { Autocomplete, TextField, CircularProgress, createFilterOptions } from '@mui/material';

type Props = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  limit?: number;
};

const localFilter = createFilterOptions<string>({
  stringify: (opt) => opt,
});

export default function AssemblyAutocomplete({
  value,
  onChange,
  label = 'Assembly',
  placeholder = 'e.g. GCA_000002515.1',
  limit = 50,
}: Props) {
  const [input, setInput] = React.useState(value);
  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const cacheRef = React.useRef<Map<string, string[]>>(new Map());

  const fetchOptions = React.useCallback(async (prefix: string) => {
    const key = prefix.trim();
    if (cacheRef.current.has(key)) { setOptions(cacheRef.current.get(key)!); return; }

    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;

    // 1η επιλογή: metadata distinct
    let url = key
      ? `/api/metadata/distinct?field=assembly&prefix=${encodeURIComponent(key)}&limit=${limit}`
      : `/api/metadata/distinct?field=assembly&limit=${limit}`;

    try {
      setLoading(true);
      let res = await fetch(url, { signal: ac.signal });

      // Fallback: distinct_assembly από zdna αν δεν υπάρχει το metadata endpoint
      if (!res.ok) {
        url = key
          ? `/api/zdna/distinct_assembly?prefix=${encodeURIComponent(key)}&limit=${limit}`
          : `/api/zdna/distinct_assembly?limit=${limit}`;
        res = await fetch(url, { signal: ac.signal });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const vals: string[] = Array.isArray(j?.values) ? j.values : [];
      const uniq = Array.from(new Set(vals)).slice(0, limit);
      cacheRef.current.set(key, uniq);
      setOptions(uniq);
    } catch (e: any) {
      if (e?.name !== 'AbortError') { console.error('assembly distinct failed', e); setOptions([]); }
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => { fetchOptions(''); }, [fetchOptions]);
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
      filterOptions={(opts, state) => {
        const filtered = localFilter(opts, state);
        return filtered.slice(0, limit);
      }}
      loading={loading}
      value={value || null}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      onChange={(_, v) => onChange((v ?? '').toString())}
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
