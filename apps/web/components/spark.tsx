const W = { x0: 10, x1: 290, yLow: 54, yHigh: 18 };

/** One line over the fortnights with the last value labelled. The line is drawn from the values: first to last across the
 *  width, the least value at the bottom and the greatest at the top. */
export function Spark({ values, label, empty = "Nothing seen yet" }: { values: readonly number[]; label: string; empty?: string }) {
  if (values.length === 0) return <p data-block="Spark" data-empty className="b-chart-empty">{empty}</p>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => ({
    x: values.length === 1 ? W.x1 : W.x0 + (i / (values.length - 1)) * (W.x1 - W.x0),
    y: hi === lo ? (W.yLow + W.yHigh) / 2 : W.yLow - ((v - lo) / (hi - lo)) * (W.yLow - W.yHigh),
  }));
  const last = pts[pts.length - 1];
  const r = (n: number) => Math.round(n * 100) / 100;
  return (
    <svg data-block="Spark" className="b-spark" viewBox="0 0 300 64" role="img" aria-label={`${label}: ${values.join(", ")} over ${values.length} fortnights`}>
      <polyline points={pts.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")} />
      <circle cx={r(last.x)} cy={r(last.y)} r={4} />
      <text x={r(last.x) - 40} y={Math.max(12, r(last.y) - 6)}>{values[values.length - 1]} now</text>
    </svg>
  );
}
