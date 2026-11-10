import type { OutcomeState } from "./outcome-states";
import { rowOf, type State } from "./status-chip";
import { StatusChip } from "./status-chip";

const LOOK = { ok: "ok", wait: "wait", act: "late", quiet: "quiet" } as const;
export const lookOf = (s: State | OutcomeState) => (rowOf(s).look ?? LOOK[rowOf(s).tone]);

/** One bar split by state, each part's length its count; with a key of counts. No children: its empty words, no bar. */
export function StackBar({ parts, empty = "No children counted yet" }: { parts: readonly { state: State | OutcomeState; n: number; words?: string }[]; empty?: string }) {
  const total = parts.reduce((t, p) => t + p.n, 0);
  if (total === 0) return <p data-block="StackBar" data-empty className="b-chart-empty">{empty}</p>;
  const say = (p: { state: State | OutcomeState; n: number; words?: string }) => `${p.n} ${p.words ?? rowOf(p.state).words}`;
  const words = parts.map(say);
  return (
    <div data-block="StackBar" className="b-stack">
      <div className="b-sbar" role="img" aria-label={words.join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <i key={p.state} data-state={lookOf(p.state)} style={{ "--n": p.n } as React.CSSProperties} />
        ))}
      </div>
      <div className="b-keyrow">
        {parts.map((p) => (
          <StatusChip key={p.state} state={p.state} words={say(p)} round />
        ))}
      </div>
    </div>
  );
}
