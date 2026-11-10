import type { StateRow } from "./status-chip";

// What a child showed on an activity (the school's `observation_outcome` rows; the screens pass its own words). Not in STATES:
// the gallery's legend draws every STATES row, and a longer legend moves every picture below it. StatusChip and StackBar take
// either kind (`rowOf`, components/status-chip.tsx).
export const OUTCOME_STATES = {
  outcomeAbove: { tone: "ok", words: "above", icon: "above" },
  outcomeAsExpected: { tone: "ok", words: "as expected", icon: "as-expected" },
  outcomeBelow: { tone: "wait", words: "below", icon: "below" },
  outcomeNotWilling: { tone: "wait", words: "not willing", icon: "not-willing" },
  outcomeAbsent: { tone: "quiet", words: "absent", icon: "absent" },
} as const satisfies Record<string, StateRow>;
export type OutcomeState = keyof typeof OUTCOME_STATES;
