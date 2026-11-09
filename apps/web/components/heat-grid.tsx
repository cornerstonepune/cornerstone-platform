import { ICON_SIZE, Icon } from "@/lib/icons";
import { STATES, type State } from "./status-chip";
import { lookOf } from "./stack-bar";

/** Classes × days: done / moved / not done / holiday, icon and word in each cell. */
export function HeatGrid({ days, rows, empty = "No days to show yet" }: { days: readonly string[]; rows: readonly { label: string; cells: readonly State[] }[]; empty?: string }) {
  if (days.length === 0 || rows.length === 0) return <p data-block="HeatGrid" data-empty className="b-chart-empty">{empty}</p>;
  return (
    <div data-block="HeatGrid" className="b-heat" style={{ "--cols": days.length } as React.CSSProperties}>
      <span className="b-h" />
      {days.map((d) => <span key={d} className="b-h">{d}</span>)}
      {rows.map((r) => [
        <span key={r.label} className="b-h">{r.label}</span>,
        ...r.cells.map((c, i) => (
          <span key={`${r.label}-${i}`} className="b-hc" data-state={lookOf(c)}>
            <Icon name={STATES[c].icon} size={ICON_SIZE.table} />
            {STATES[c].words}
          </span>
        )),
      ])}
    </div>
  );
}
