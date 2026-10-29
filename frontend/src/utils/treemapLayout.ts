/**
 * Keep the treemap artwork inside the ECharts canvas. The breadcrumb is drawn
 * below the chart (not by ECharts), so no extra bottom space is reserved.
 */
export const TREEMAP_SERIES_BOUNDS = {
  left: 8,
  right: 8,
  top: 8,
  bottom: 8,
} as const;

/**
 * Very small taxonomic groups should still be painted, even when their label
 * cannot fit inside the proportional tile.
 */
export const TREEMAP_MIN_VISIBLE_AREA = 1;
