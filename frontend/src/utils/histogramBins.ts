export type Histogram = { labels: string[]; ranges: string[]; counts: number[] };

const fmt = (n: number) => n.toLocaleString('en-US');

/** Smallest 1/2/2.5/5 × 10^k step that is at least `raw`. */
function niceStep(raw: number): number {
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
}

/**
 * Genome sizes (bp) in about `target` bins with round kb edges. Bars are labelled
 * by their lower edge in kb; `ranges` gives the full range for tooltips.
 */
export function genomeSizeHistogram(valuesBp: number[], target = 20): Histogram {
  const kb = valuesBp.filter(v => Number.isFinite(v) && v > 0).map(v => v / 1000);
  if (!kb.length) return { labels: [], ranges: [], counts: [] };
  const min = Math.min(...kb);
  const max = Math.max(...kb);
  const step = niceStep(Math.max((max - min) / target, 1));
  const start = Math.floor(min / step) * step;
  const n = Math.max(1, Math.floor((max - start) / step) + 1);
  const counts = new Array(n).fill(0);
  for (const v of kb) counts[Math.min(n - 1, Math.floor((v - start) / step))]++;
  const edges = counts.map((_, i) => start + i * step);
  return {
    labels: edges.map(fmt),
    ranges: edges.map(e => `${fmt(e)}–${fmt(e + step)} kb`),
    counts,
  };
}

/**
 * GC% in whole-percent bins that never share an edge: 1% bins labelled "34", "35", …
 * or, for wide ranges, w% bins labelled "34–35", "36–37", … (by integer part).
 */
export function gcHistogram(values: number[], maxBins = 30): Histogram {
  const v = values.filter(Number.isFinite);
  if (!v.length) return { labels: [], ranges: [], counts: [] };
  const lo = Math.floor(Math.min(...v));
  const hi = Math.floor(Math.max(...v));
  const width = Math.max(1, Math.ceil((hi - lo + 1) / maxBins));
  const start = Math.floor(lo / width) * width;
  const n = Math.floor((hi - start) / width) + 1;
  const counts = new Array(n).fill(0);
  for (const x of v) counts[Math.min(n - 1, Math.floor((Math.floor(x) - start) / width))]++;
  const labels = counts.map((_, i) => {
    const a = start + i * width;
    return width === 1 ? String(a) : `${a}–${a + width - 1}`;
  });
  return { labels, ranges: labels.map(l => `${l} %GC`), counts };
}
