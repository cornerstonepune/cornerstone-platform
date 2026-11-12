import type { StateRow } from "./status-chip";

// What a child showed on an activity: five outcomes, written on the observation itself (a check on `activity_observation.outcome`;
// the `observation_outcome` table was retired by CP-27, so no screen reads the words from the database). Not in STATES:
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

const BY_CODE = { above: "outcomeAbove", as_expected: "outcomeAsExpected", below: "outcomeBelow", not_willing: "outcomeNotWilling", absent: "outcomeAbsent" } as const satisfies Record<string, OutcomeState>;
/** The words an outcome is said with ("not willing"); a code this file does not know is shown as it is. */
export const outcomeWords = (code: string): string => (code in BY_CODE ? OUTCOME_STATES[BY_CODE[code as keyof typeof BY_CODE]].words : code);

/** The five outcomes in the order a screen lists them, each with the state it is drawn in. */
export const OUTCOME_ORDER: readonly (readonly [string, OutcomeState])[] = [["above", "outcomeAbove"], ["as_expected", "outcomeAsExpected"], ["below", "outcomeBelow"], ["not_willing", "outcomeNotWilling"], ["absent", "outcomeAbsent"]];
