import { ICON_SIZE, Icon } from "@/lib/icons";
import { STATES, type State } from "./status-chip";
import { lookOf } from "./stack-bar";

/** Classes × days: done / moved / not done / holiday, icon and word in each cell. */
export function HeatGrid({ days, rows, empty = "No days to show yet" }: { days: readonly string[]; rows: readonly { label: string; cells: readonly State[]; hrefs?: readonly (string | null)[] }[]; empty?: string }) {
  if (days.length === 0 || rows.length === 0) return <p data-block="HeatGrid" data-empty className="b-chart-empty">{empty}</p>;
  return (
    <div data-block="HeatGrid" className="b-heat" style={{ "--cols": days.length } as React.CSSProperties}>
      <span className="b-h" />
      {days.map((d) => <span key={d} className="b-h">{d}</span>)}
      {rows.map((r) => [
        <span key={r.label} className="b-h">{r.label}</span>,
        ...r.cells.map((c, i) => {
          const body = (
            <>
              <Icon name={STATES[c].icon} size={ICON_SIZE.table} />
              {STATES[c].words}
            </>
          );
          const href = r.hrefs?.[i];
          const key = `${r.label}-${i}`;
          return href ? (
            <a key={key} href={href} className="b-hc" data-state={lookOf(c)} data-press="" aria-label={`${r.label}, ${days[i]}: ${STATES[c].words}`}>
              {body}
            </a>
          ) : (
            <span key={key} className="b-hc" data-state={lookOf(c)}>
              {body}
            </span>
          );
        }),
      ])}
    </div>
  );
}
