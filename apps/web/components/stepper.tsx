import { ICON_SIZE, Icon } from "@/lib/icons";
import { STATES, type State } from "./status-chip";

const LOOK = { ok: "ok", wait: "wait", act: "late", quiet: "quiet" } as const;

/** The steps of a thing: done green, waiting amber, late red, the rest quiet. Icon and the step's own words. */
export function Stepper({ steps, label }: { steps: readonly { state: State; words: string }[]; label?: string }) {
  return (
    <ol data-block="Stepper" className="b-stepper" aria-label={label}>
      {steps.map((s) => (
        <li key={s.words} className="b-step" data-state={LOOK[STATES[s.state].tone]}>
          <Icon name={STATES[s.state].icon} size={ICON_SIZE.table} />
          {s.words}
        </li>
      ))}
    </ol>
  );
}
