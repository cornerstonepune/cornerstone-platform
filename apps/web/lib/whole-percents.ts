/** Counts as whole percents that add up to 100 (the largest remainders take the leftover points, the earlier part first on a tie), so a
 *  bar's key never says 33% + 33% + 33%. No counts, or all zero: all zero. */
export function wholePercents(counts: readonly number[]): number[] {
  const total = counts.reduce((t, n) => t + n, 0);
  if (total <= 0) return counts.map(() => 0);
  const exact = counts.map((n) => (n * 100) / total);
  const out = exact.map(Math.floor);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  const left = 100 - out.reduce((t, n) => t + n, 0);
  for (let k = 0; k < left; k++) out[order[k].i] += 1;
  return out;
}
