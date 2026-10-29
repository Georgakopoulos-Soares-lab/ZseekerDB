import { APP_FONT_SCALE, scaledRem } from './typographyScale.ts';

// Text drawn inside plots (axis titles, ticks, labels, in-chart titles) is 2px
// larger than the scaled base; tooltips and the treemap keep the scaled size.
export const PLOT_FONT_BUMP = 2;

export const VIZ_FONT = {
  subscript: 7 * APP_FONT_SCALE + PLOT_FONT_BUMP,
  histogramCompact: 9 * APP_FONT_SCALE + PLOT_FONT_BUMP,
  compactTooltip: 11 * APP_FONT_SCALE,
  base: 12 * APP_FONT_SCALE + PLOT_FONT_BUMP,
  defaultTooltip: 14 * APP_FONT_SCALE,
  title: 18 * APP_FONT_SCALE + PLOT_FONT_BUMP,
  treemapLabel: 13 * APP_FONT_SCALE,
  treemapMin: 11 * APP_FONT_SCALE,
  treemapHeader: 14 * APP_FONT_SCALE,
} as const;

export const VIZ_MUI_FONT = {
  pageTitle: scaledRem(1.5),
  cardTitle: scaledRem(1.25),
  sectionTitle: scaledRem(0.875),
  chartTitle: `calc(${scaledRem(0.875)} + ${PLOT_FONT_BUMP}px)`,
  caption: scaledRem(0.75),
  metric: scaledRem(1.1),
  sidebarCount: scaledRem(0.9),
} as const;
