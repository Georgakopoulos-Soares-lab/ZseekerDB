import * as React from 'react';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material'; // <- type-only import (σημαντικό)

type Ctx = { mode: PaletteMode; toggle: () => void };
export const ColorModeContext = React.createContext<Ctx>({ mode: 'dark', toggle: () => {} });
export const useColorMode = () => React.useContext(ColorModeContext);

function getTheme(mode: PaletteMode) {
  const isLight = mode === 'light';
  return createTheme({
    palette: {
      mode,
      primary: { main: isLight ? '#1976d2' : '#90caf9' },   // blue accent
      secondary: { main: '#e91e63' },
      background: {
        default: isLight ? '#f5f7fb' : '#0d0f12',
        paper:   isLight ? '#ffffff' : '#12161c',
      },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiAppBar: { styleOverrides: { root: { boxShadow: 'none', borderBottom: `1px solid ${isLight ? '#e6eaf2' : '#1f2530'}` } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none', borderRight: `1px solid ${isLight ? '#e6eaf2' : '#1f2530'}` } } },
      MuiPaper:  { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: isLight ? alpha('#1976d2', 0.12) : alpha('#90caf9', 0.18),
              color: isLight ? '#0d47a1' : '#e3f2fd'
            },
            '&.Mui-selected:hover': {
              backgroundColor: isLight ? alpha('#1976d2', 0.18) : alpha('#90caf9', 0.24),
            }
          }
        }
      }
    }
  });
}

export default function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const stored = (localStorage.getItem('zdna-theme') as PaletteMode | null);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial: PaletteMode = stored ?? (prefersDark ? 'dark' : 'light');

  const [mode, setMode] = React.useState<PaletteMode>(initial);

  const ctx = React.useMemo<Ctx>(() => ({
    mode,
    toggle: () => setMode(m => {
      const next: PaletteMode = (m === 'light') ? 'dark' : 'light';
      localStorage.setItem('zdna-theme', next);
      return next;
    })
  }), [mode]);

  const theme = React.useMemo(() => getTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
