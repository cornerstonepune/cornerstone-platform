/** Four bars, levels 0–3, how many children at each; each bar's length is its share of the children counted. */
export function LevelBars({ levels, empty = "No levels recorded yet" }: { levels: readonly { level: number; n: number; label?: string }[]; empty?: string }) {
  const total = levels.reduce((t, l) => t + l.n, 0);
  if (total === 0) return <p data-block="LevelBars" data-empty className="b-chart-empty">{empty}</p>;
  return (
    <div data-block="LevelBars" className="b-lbars">
      {levels.map((l) => (
        <div key={l.level} className="b-lbar">
          <span>{l.label ?? `Level ${l.level}`}</span>
          <i style={{ "--n": Math.round((l.n / total) * 10000) / 100 } as React.CSSProperties} />
          <span className="b-num">{l.n}</span>
        </div>
      ))}
    </div>
  );
}
