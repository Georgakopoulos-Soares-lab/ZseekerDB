import { APP_FONT_SCALE, scaledRem } from './typographyScale.ts';

export const VIZ_FONT = {
  subscript: 7 * APP_FONT_SCALE,
  histogramCompact: 9 * APP_FONT_SCALE,
  compactTooltip: 11 * APP_FONT_SCALE,
  base: 12 * APP_FONT_SCALE,
  defaultTooltip: 14 * APP_FONT_SCALE,
  title: 18 * APP_FONT_SCALE,
  treemapLabel: 13 * APP_FONT_SCALE,
  treemapMin: 11 * APP_FONT_SCALE,
  treemapHeader: 14 * APP_FONT_SCALE,
} as const;

export const VIZ_MUI_FONT = {
  pageTitle: scaledRem(1.5),
  cardTitle: scaledRem(1.25),
  sectionTitle: scaledRem(0.875),
  caption: scaledRem(0.75),
  metric: scaledRem(1.1),
  sidebarCount: scaledRem(0.9),
} as const;
