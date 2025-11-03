// frontend/src/components/DataTable.tsx
import * as React from 'react';
import { Box } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  GridToolbarQuickFilter,
  GridToolbarContainer,
} from '@mui/x-data-grid';

type Props = {
  rows: any[];
  columns: string[];
  visible: Record<string, boolean>;
  height?: number;
};

// Column configuration type
export type MetadataColumn = {
  dbName: string;
  label: string;
  hidden: boolean;
};

// Column definitions in display order
export const METADATA_COLUMNS: MetadataColumn[] = [
  { dbName: "assembly", label: "Assembly", hidden: false },
  { dbName: "bioproject", label: "Bioproject", hidden: true },
  { dbName: "biosample", label: "Biosample", hidden: true },
  { dbName: "taxid", label: "Taxon ID", hidden: false },
  { dbName: "assembly_level", label: "Assembly level", hidden: true },
  { dbName: "genome_size", label: "Genome size", hidden: false },
  { dbName: "gc_percent", label: "GC content (%)", hidden: false },
  { dbName: "superkingdom", label: "Superkingdom", hidden: false },
  { dbName: "kingdom", label: "Kingdom", hidden: false },
  { dbName: "phylum", label: "Phylum", hidden: false },
  { dbName: "class", label: "Class", hidden: false },
  { dbName: "order", label: "Order", hidden: false },
  { dbName: "family", label: "Family", hidden: false },
  { dbName: "genus", label: "Genus", hidden: false },
  { dbName: "tax_name", label: "Specie", hidden: false },
  { dbName: "is_t2t", label: "T2T", hidden: false },
  { dbName: "viral_realm", label: "Viral realm", hidden: false },
  { dbName: "updated_tax_name", label: "Infraspecific name", hidden: false },
  { dbName: "obs_zbp", label: "Z-DNA bps", hidden: false },
  { dbName: "obs_density_per_kb", label: "Z-DNA density (per kb)", hidden: false },
  { dbName: "obs_n_zdna", label: "Number of predictions", hidden: false },
];

// Create a map for quick label lookups
const LABELS: Record<string, string> = Object.fromEntries(
  METADATA_COLUMNS.map(col => [col.dbName, col.label])
);

// Create a map for default visibility
const DEFAULT_VISIBILITY: Record<string, boolean> = Object.fromEntries(
  METADATA_COLUMNS.map(col => [col.dbName, !col.hidden])
);

function QuickToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarQuickFilter />
    </GridToolbarContainer>
  );
}

export default function DataTable({ rows, columns, visible, height = 480 }: Props) {
  // Combine default visibility with provided visibility
  const isVisible = React.useCallback((field: string) => {
    // First check if there's an explicit visibility setting
    if (Object.prototype.hasOwnProperty.call(visible, field)) {
      return !!visible[field];
    }
    
    // Otherwise use the default from METADATA_COLUMNS
    const column = METADATA_COLUMNS.find(col => col.dbName === field);
    if (column) {
      return !column.hidden;
    }
    
    // If field not in METADATA_COLUMNS, show by default
    return true;
  }, [visible]);

  const gridColumns: GridColDef[] = React.useMemo(() => {
    // Sort columns to match METADATA_COLUMNS order
    const columnOrder = new Map(METADATA_COLUMNS.map((col, i) => [col.dbName, i]));
    
    return columns
      .sort((a, b) => {
        const orderA = columnOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
        const orderB = columnOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      })
      .map((field) => ({
        field,
        headerName: LABELS[field] ?? field,
        flex: 1,
        hide: !isVisible(field), // This will now use the hidden property
        sortable: true,
        minWidth: 140,
        valueGetter: (params) => params.row?.[field],
      }));
  }, [columns, isVisible]);

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
