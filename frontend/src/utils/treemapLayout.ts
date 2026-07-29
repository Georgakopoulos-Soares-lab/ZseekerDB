/**
 * Keep the treemap artwork inside the ECharts canvas. The bottom inset also
 * reserves space for the breadcrumb so it cannot cover the lowest tiles.
 */
export const TREEMAP_SERIES_BOUNDS = {
  left: 8,
  right: 8,
  top: 8,
  bottom: 44,
} as const;

/**
 * Very small taxonomic groups should still be painted, even when their label
 * cannot fit inside the proportional tile.
 */
export const TREEMAP_MIN_VISIBLE_AREA = 1;
