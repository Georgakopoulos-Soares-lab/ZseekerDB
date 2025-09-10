import * as React from 'react';
import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';

type Props = {
  /** Δώσε μου URL για κατέβασμα ανάλογα με το fmt (csv|tsv) */
  buildUrl: (fmt: 'csv' | 'tsv') => string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  title?: string;
};

export default function ExportMenu({ buildUrl, disabled, size = 'small', title = 'Export' }: Props) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const onOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const onClose = () => setAnchorEl(null);

  const triggerDownload = (fmt: 'csv' | 'tsv') => {
    const url = buildUrl(fmt);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClose();
  };

  return (
    <>
      <Tooltip title={title}>
        <span>
          <IconButton size={size} onClick={onOpen} disabled={disabled}>
            <DownloadIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
        <MenuItem onClick={() => triggerDownload('csv')}>Export CSV</MenuItem>
        <MenuItem onClick={() => triggerDownload('tsv')}>Export TSV</MenuItem>
      </Menu>
    </>
  );
}
