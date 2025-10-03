import * as React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar, Box, CssBaseline, Divider, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip
} from '@mui/material';
import TableViewIcon from '@mui/icons-material/TableView';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import HelpIcon from '@mui/icons-material/Help';
import DnsIcon from '@mui/icons-material/Dns';
import CodeIcon from '@mui/icons-material/Code';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import Brand from '../components/Brand';
import { useColorMode } from '../ThemeModeProvider';

const drawerWidth = 240;

const items = [
  { to: '/explore', label: 'Sequence search', icon: <TableViewIcon /> },
  { to: '/metadata', label: 'Species browser', icon: <DnsIcon /> },
  { to: '/MetadataStats', label: 'Species insights', icon: <AnalyticsIcon /> },
  { to: '/help', label: 'Help', icon: <HelpIcon /> },
];

//{ to: '/data-stats', label: 'Insights', icon: <AnalyticsIcon /> },

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { pathname } = useLocation();
  const toggleMobile = () => setMobileOpen(!mobileOpen);
  const { mode, toggle } = useColorMode();

  const drawer = (
    <div>
      <Toolbar />
      <Divider />
      <List>
        {items.map(it => (
          <ListItemButton
            key={it.to}
            component={Link}
            to={it.to}
            selected={pathname.startsWith(it.to)}
            onClick={() => setMobileOpen(false)}
          >
            <ListItemIcon>{it.icon}</ListItemIcon>
            <ListItemText primary={it.label} />
          </ListItemButton>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />

      <AppBar position="fixed" color="default" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton color="inherit" edge="start" onClick={toggleMobile} sx={{ display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>

          {/* Brand αριστερά */}
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <Brand />
          </Box>

          {/* Theme toggle δεξιά */}
          <Tooltip title={mode === 'light' ? 'Switch to dark' : 'Switch to light'}>
            <IconButton color="primary" onClick={toggle}>
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Drawers */}
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={toggleMobile}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, width: { sm: `calc(100% - ${drawerWidth}px)` } }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
