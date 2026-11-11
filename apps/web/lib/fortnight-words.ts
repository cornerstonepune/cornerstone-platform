import type { State } from "@/components/status-chip";

// The one place the fortnight's real states (fortnight.state, specs/CP-6/design.md) get the words the school sees. The data
// is not changed: this only names it. Each row says where its word comes from.
//   Drafted  – docs/frontend/SPEC.md, Fortnight 9 stepper ("drafted").        Real state: planning.
//   Frozen   – SPEC, Fortnight 9 stepper ("frozen").                           Real state: frozen.
//   Aligned  – no SPEC word; CP-6's own state name, said plainly.              Real state: aligned.
//   Approved – SPEC, Fortnight 9 stepper ("approved").                         Real state: approved.
//   List sent – no SPEC word; CP-6's own state name, said plainly.             Real state: list_sent.
// PENDING: SPEC's "live" has no fortnight state. Going live is a per-class approval of kind `timetable_live` and the
// engine has no route for it yet (reported to the orchestrator, 10 Nov 2026), so no "Live" step is drawn.
export const FORTNIGHT_STEPS = [
  { state: "planning", words: "Drafted" },
  { state: "frozen", words: "Frozen" },
  { state: "aligned", words: "Aligned" },
  { state: "approved", words: "Approved" },
  { state: "list_sent", words: "List sent" },
] as const;
export type FortnightState = (typeof FORTNIGHT_STEPS)[number]["state"];

export const isFortnightState = (s: string): s is FortnightState => FORTNIGHT_STEPS.some((x) => x.state === s);
export const stateWords = (s: string): string => FORTNIGHT_STEPS.find((x) => x.state === s)?.words ?? s;

/** The stepper's steps for a fortnight in `state`: the steps taken are done, the next waits, the rest are quiet. */
export function steppedFor(state: string): { state: State; words: string }[] {
  const at = FORTNIGHT_STEPS.findIndex((x) => x.state === state);
  return FORTNIGHT_STEPS.map((x, i) => ({ words: x.words, state: i <= at ? "done" : i === at + 1 ? "waiting" : "blank" }));
}

/** The state after `state`, or null when it is the last. */
export const nextState = (state: string): FortnightState | null => FORTNIGHT_STEPS[FORTNIGHT_STEPS.findIndex((x) => x.state === state) + 1]?.state ?? null;
