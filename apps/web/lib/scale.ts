// The one state scale (docs/frontend/page-charter.md A3): green secure, amber practising, red needs help, grey not seen. A rubric level
// 0–3 is drawn on the same scale (0 grey, 1 red, 2 amber, 3 green) with the activity's own words beside it. The colours are the
// blocks' `data-state` rows (blocks.css), so a page names a state here and never a colour. Pure, so a test can read it.
export type ScaleState = "secure" | "practising" | "needs-help" | "not-seen";
export type Tone = "ok" | "wait" | "late" | "quiet";

export const SCALE: Record<ScaleState, { tone: Tone; words: string }> = {
  secure: { tone: "ok", words: "secure" },
  practising: { tone: "wait", words: "practising" },
  "needs-help": { tone: "late", words: "needs help" },
  "not-seen": { tone: "quiet", words: "not seen" },
};

/** The rubric's levels 0, 1, 2, 3 on the scale: grey, red, amber, green. */
export const LEVEL_SCALE: readonly ScaleState[] = ["not-seen", "needs-help", "practising", "secure"];
export const levelTone = (level: number): Tone => SCALE[LEVEL_SCALE[Math.min(3, Math.max(0, Math.trunc(level)))]].tone;
