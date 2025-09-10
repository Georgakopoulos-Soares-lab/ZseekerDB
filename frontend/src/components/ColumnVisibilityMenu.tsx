import { Checkbox, FormControlLabel, IconButton, Menu, MenuItem } from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { useMemo, useState } from 'react';

type Props = {
  columns: string[];
  visibility: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
};
export function ColumnVisibilityMenu({ columns, visibility, onChange }: Props) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const ordered = useMemo(() => columns, [columns]);

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)}><ViewColumnIcon /></IconButton>
      <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {ordered.map((c) => (
          <MenuItem key={c} dense>
            <FormControlLabel
              control={
                <Checkbox
                  checked={visibility[c] ?? true}
                  onChange={(e) => onChange({ ...visibility, [c]: e.target.checked })}
                />
              }
              label={c}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
