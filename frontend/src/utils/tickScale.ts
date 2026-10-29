/**
 * Custom tick ladders drawn at equal distances on an axis (e.g. 50, 75, 100, 200, 500 …).
 * Values are plotted at their position on the ladder: log-interpolated between two
 * positive ticks, linear between 0 and the next tick. Tooltips should show raw values.
 */
export const SCORE_TICKS = [50, 75, 100, 200, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000];
export const LENGTH_TICKS = [9, 20, 50, 100, 200, 500, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000];
export const DENSITY_TICKS = [0, 1, 10, 100, 1_000]; // Z-DNA density (/kb); 1,000 = every base
export const COUNT_TICKS = [0, 1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000];

/** Ticks up to and including the first one that reaches `max` (at least two ticks). */
export function ticksUpTo(ladder: number[], max: number): number[] {
  const i = ladder.findIndex(t => t >= max);
  const end = i === -1 ? ladder.length : i + 1;
  return ladder.slice(0, Math.max(end, 2));
}

/** Position of `v` on the ladder: tick i sits at i; values outside are clamped. */
export function tickPosition(ticks: number[], v: number): number {
  if (!(v > ticks[0])) return 0;
  for (let i = 0; i < ticks.length - 1; i++) {
    const a = ticks[i];
    const b = ticks[i + 1];
    if (v <= b) {
      const f = a > 0 ? Math.log(v / a) / Math.log(b / a) : (v - a) / (b - a);
      return i + f;
    }
  }
  return ticks.length - 1;
}

/**
 * Linear ticks from `base` to the first round step at or above `max`, e.g.
 * (50, 66) -> 50, 55, 60, 65, 70 and (9, 51) -> 9, 20, 30, 40, 50, 60.
 */
export function linearTicks(base: number, max: number): number[] {
  const raw = Math.max((max - base) / 5, 1e-9);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const ticks = [base];
  // First round tick, skipped if it would crowd the base tick.
  let t = Math.ceil(base / step) * step;
  if (t - base < step * 0.4) t += step;
  for (; ; t += step) {
    ticks.push(t);
    if (t >= max) break;
  }
  return ticks;
}
