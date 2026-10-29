import * as React from 'react';
import type { PaletteMode } from '@mui/material';

export type Ctx = { mode: PaletteMode; toggle: () => void };
export const ColorModeContext = React.createContext<Ctx>({ mode: 'dark', toggle: () => {} });
export const useColorMode = () => React.useContext(ColorModeContext);
