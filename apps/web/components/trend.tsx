const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2026-08-04 → 4-Aug (read from the text, so no time zone moves it). */
export const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const X = { a: 40, b: 580 };

/** A child's level per sitting over dates. A sitting sits at its date along the width and at its level up the height
 *  (level 0 at the bottom, 3 at the top); the first and the last are labelled with their date and level. */
export function Trend({ sittings, empty = "No sittings yet" }: { sittings: readonly { date: string; level: number }[]; empty?: string }) {
  if (sittings.length === 0) return <p data-block="Trend" data-empty className="b-chart-empty">{empty}</p>;
  const t = sittings.map((s) => Date.parse(`${s.date}T00:00:00Z`));
  const span = t[t.length - 1] - t[0];
  const pts = sittings.map((s, i) => ({ x: span === 0 ? X.a : X.a + ((t[i] - t[0]) / span) * (X.b - X.a), y: 100 - s.level * 30 }));
  const first = sittings[0];
  const last = sittings[sittings.length - 1];
  const say = (s: { date: string; level: number }) => `${shortDate(s.date)} · level ${s.level}`;
  const r = (n: number) => Math.round(n * 100) / 100;
  return (
    <svg data-block="Trend" className="b-trend" viewBox="0 0 600 120" role="img" aria-label={`Level by sitting: ${sittings.map((s) => s.level).join(", ")}`}>
      <polyline points={pts.map((p) => `${r(p.x)},${r(p.y)}`).join(" ")} />
      {pts.map((p) => <circle key={`${p.x}-${p.y}`} cx={r(p.x)} cy={r(p.y)} r={4} />)}
      <text x={20} y={118}>{say(first)}</text>
      {sittings.length > 1 ? <text x={500} y={Math.max(14, r(pts[pts.length - 1].y) - 10)}>{say(last)}</text> : null}
    </svg>
  );
}
