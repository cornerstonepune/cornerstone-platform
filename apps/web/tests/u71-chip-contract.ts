// UI-2, Done when 3: a state without an icon does not compile. `@ts-expect-error` fails `tsc` the day the line below compiles.
// Never run.
import type { StateRow } from "@/components/status-chip";

// @ts-expect-error a state row with no icon
export const noIcon: StateRow = { tone: "ok", words: "done" };
