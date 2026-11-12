import { PRACTISING, SECURE, type State, type Tone } from "@/components/status-chip";

// The one state scale of the site (docs/frontend/page-charter.md A3): green secure, amber practising, red needs help, grey not seen, in that
// order wherever a child's standing is counted or drawn. Its words are the STATES rows' (secure and practising are the engine's own
// `child_state` codes, components/status-chip.tsx), never typed here. A rubric's levels use the scale's colours: the top level green, the
// lowest grey, every level between amber. Never red: red is never a child (DESIGN.md §3; Nimish, 12 Nov: "Amber, not red"). The words
// beside each colour are the activity's own, never this file's.
export const SCALE = [SECURE, PRACTISING, "needsHelp", "notSeenYet"] as const satisfies readonly State[];
export type ScaleState = (typeof SCALE)[number];

/** The scale's state for level `n` of a rubric of `count` levels (0 the lowest). Four levels: 0 grey, 1 amber, 2 amber, 3 green. */
export function levelState(n: number, count: number): ScaleState {
  if (!Number.isInteger(n) || n < 0 || n >= count) throw new RangeError(`level ${n} is not one of ${count}`);
  if (n === count - 1) return SCALE[0];
  return n === 0 ? SCALE[3] : SCALE[1];
}

// Each in the scale's order (SCALE[i] is drawn TONES[i] and LOOKS[i]): the scale's first two are the engine's growth codes, typed as the
// whole growth union, so the colours are read by place on the scale, not by a record keyed by the codes' words.
const TONES = ["ok", "wait", "act", "quiet"] as const satisfies readonly Tone[];
const LOOKS = ["ok", "wait", "late", "quiet"] as const;

/** The tone (the colour) of a scale state, for a block that draws a fill rather than a chip. */
export const scaleTone = (s: ScaleState): Tone => TONES[SCALE.indexOf(s)];

/** The `data-state` a block's rules read (components/blocks.css) for a scale state. */
export const scaleLook = (s: ScaleState): (typeof LOOKS)[number] => LOOKS[SCALE.indexOf(s)];
