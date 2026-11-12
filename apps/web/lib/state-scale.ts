import type { State, Tone } from "@/components/status-chip";

// The one state scale of the site (docs/frontend/page-charter.md A3): green secure, amber practising, red needs help, grey not seen, in that
// order wherever a child's standing is counted or drawn. Its words are the STATES rows' (secure and practising are the engine's own
// `child_state` codes, components/status-chip.tsx), never typed here. A rubric's levels use the same four colours: the top level green, the
// one under it amber, the lowest grey, any between red; the words beside each colour are the activity's own, never this file's.
export const SCALE = ["secure", "practising", "needsHelp", "notSeenYet"] as const satisfies readonly State[];
export type ScaleState = (typeof SCALE)[number];

/** The scale's state for level `n` of a rubric of `count` levels (0 the lowest). Four levels: 0 grey, 1 red, 2 amber, 3 green. */
export function levelState(n: number, count: number): ScaleState {
  if (!Number.isInteger(n) || n < 0 || n >= count) throw new RangeError(`level ${n} is not one of ${count}`);
  if (n === count - 1) return "secure";
  if (n === count - 2 && n > 0) return "practising";
  return n === 0 ? "notSeenYet" : "needsHelp";
}

/** The tone (the colour) of a scale state, for a block that draws a fill rather than a chip. */
export const SCALE_TONE: Record<ScaleState, Tone> = { secure: "ok", practising: "wait", needsHelp: "act", notSeenYet: "quiet" };

/** The `data-state` a block's rules read (components/blocks.css) for a scale state. */
export const SCALE_LOOK: Record<ScaleState, "ok" | "wait" | "late" | "quiet"> = { secure: "ok", practising: "wait", needsHelp: "late", notSeenYet: "quiet" };
