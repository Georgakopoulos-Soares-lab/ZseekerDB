import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TableSortLabel,
} from '@mui/material';
import React from 'react';

// Map raw column keys to nicer headers
const LABELS: Record<string, string> = {
  assembly: 'Assembly',
  taxid: 'Taxid',
  genome_size: 'Genome Size',
  genome_size_ungapped: 'Genome Size (Ungapped)',
  gc_percent: 'GC Percent',
  superkingdom: 'Superkingdom',
  kingdom: 'Kingdom',
  phylum: 'Phylum',
  class: 'Class',
  order: 'Order',
  family: 'Family',
  genus: 'Genus',
  tax_name: 'Taxonomies',
  filename: 'Filename',
};

// helper: από "genome_size_ungapped" -> "Genome Size Ungapped"
function toTitle(key: string) {
  return key
    .split('_')
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ''))
    .join(' ');
}

type Props = {
  rows: any[];
  columns: string[];
  visible: Record<string, boolean>;
};

// Small helper: detect numbers vs strings and sort accordingly
function compareValues(a: any, b: any) {
  // Normalize null/undefined
  const va = a === null || a === undefined ? '' : a;
  const vb = b === null || b === undefined ? '' : b;

  // Try numeric comparison first
  const na = typeof va === 'number' ? va : Number.parseFloat(String(va));
  const nb = typeof vb === 'number' ? vb : Number.parseFloat(String(vb));
  const aIsNum = !Number.isNaN(na);
  const bIsNum = !Number.isNaN(nb);

  if (aIsNum && bIsNum) {
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  }

  // Fallback to case-insensitive, "numeric" aware string comparison
  return String(va).localeCompare(String(vb), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export default function GenericTable({ rows, columns, visible }: Props) {
  const shown = React.useMemo(
    () => columns.filter((c) => (visible[c] ?? true)),
    [columns, visible]
  );

  // Local (page-only) sorting state
  const [orderBy, setOrderBy] = React.useState<string | null>(null);
  const [order, setOrder] = React.useState<'asc' | 'desc'>('asc');

  const handleSortClick = (col: string) => {
    if (orderBy === col) {
      setOrder((p) => (p === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(col);
      setOrder('asc');
    }
  };

  const pageRows = React.useMemo(() => {
    if (!orderBy) return rows; // no sorting => as-is
    const copy = [...rows];
    copy.sort((ra, rb) => {
      const cmp = compareValues(ra?.[orderBy as string], rb?.[orderBy as string]);
      return order === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, orderBy, order]);

  return (
    <TableContainer component={Paper} elevation={0}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {shown.map((c) => (
              <TableCell key={c} sx={{ whiteSpace: 'nowrap', userSelect: 'none' }}>
                <TableSortLabel
                  active={orderBy === c}
                  direction={orderBy === c ? order : 'asc'}
                  onClick={() => handleSortClick(c)}
                >
                  {LABELS[c] ?? toTitle(c)}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {pageRows.map((r, i) => (
            <TableRow key={i} hover>
              {shown.map((c) => (
                <TableCell key={c}>
                  {r?.[c] === null || r?.[c] === undefined ? '' : String(r[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {pageRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={shown.length}>
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No rows
                  </Typography>
                </Box>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
