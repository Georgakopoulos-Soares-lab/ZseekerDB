import { Checkbox, FormControlLabel, IconButton, Menu, MenuItem } from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { useMemo, useState } from 'react';
import { METADATA_COLUMNS } from './DataTable';

type Props = {
  columns: string[];
  visibility: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
};

export function ColumnVisibilityMenu({ columns, visibility, onChange }: Props) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  
  // Sort menu items according to METADATA_COLUMNS order
  const ordered = useMemo(() => {
    const columnOrder = new Map(METADATA_COLUMNS.map((col, i) => [col.dbName, i]));
    return [...columns].sort((a, b) => {
      const orderA = columnOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
      const orderB = columnOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [columns]);

  // Get display label for each column
  const getLabel = (dbName: string) => {
    const col = METADATA_COLUMNS.find(c => c.dbName === dbName);
    return col?.label ?? dbName;
  };

  // Get default visibility for a column
  const getDefaultVisibility = (dbName: string) => {
    const col = METADATA_COLUMNS.find(c => c.dbName === dbName);
    return col ? !col.hidden : true;
  };

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
        <ViewColumnIcon />
      </IconButton>
      <Menu 
        open={Boolean(anchor)} 
        anchorEl={anchor} 
        onClose={() => setAnchor(null)}
      >
        {ordered.map((c) => (
          <MenuItem key={c} dense>
            <FormControlLabel
              control={
                <Checkbox
                  checked={visibility[c] ?? getDefaultVisibility(c)}
                  onChange={(e) => onChange({ ...visibility, [c]: e.target.checked })}
                />
              }
              label={getLabel(c)}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
