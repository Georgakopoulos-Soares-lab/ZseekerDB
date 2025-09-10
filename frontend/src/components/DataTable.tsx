// frontend/src/components/DataTable.tsx
import * as React from 'react';
import { Box } from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridToolbarQuickFilter,
  GridToolbarContainer,
} from '@mui/x-data-grid';

type Props = {
  rows: any[];
  columns: string[];
  visible: Record<string, boolean>;
  height?: number;
};

// Χάρτης "κλειδί -> label" για τα headers
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

// Toolbar με ένα γρήγορο filter (προαιρετικό)
function QuickToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarQuickFilter />
    </GridToolbarContainer>
  );
}

export default function DataTable({ rows, columns, visible, height = 480 }: Props) {
  // Αν δεν μας ήρθε explicit "visible" για ένα πεδίο, το θεωρούμε ορατό
  const isVisible = (field: string) =>
    Object.prototype.hasOwnProperty.call(visible, field) ? !!visible[field] : true;

  const gridColumns: GridColDef[] = React.useMemo(() => {
    return columns.map((field) => {
      const headerName = LABELS[field] ?? toTitle(field);
      return {
        field,
        headerName,
        flex: 1,
        hide: !isVisible(field),
        sortable: true,
        minWidth: 140,
        valueGetter: (params) => params.row?.[field],
      } as GridColDef;
    });
  }, [columns, visible]);

  return (
    <Box sx={{ width: '100%', height }}>
      <DataGrid
        rows={rows.map((r, i) => ({ id: i, ...r }))}
        columns={gridColumns}
        density="compact"
        disableColumnFilter
        disableRowSelectionOnClick
        slots={{ toolbar: QuickToolbar }}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </Box>
  );
}
