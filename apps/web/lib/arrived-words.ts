// The words of "what arrived" (CP-86), in one place: what the engine sends for a claim, and which line of a refused call a sentence of its refusal is about.
// Pure, so the form (a client component) and the panel (a server one) share it. Nothing is decided here: who may record, and what is wrong with a line, is the engine's.
export type ArrivedMove = { on: string; item: string; material_code: string; quantity: number; unit: string; by: string };
export type Arrived = { claim: { id: string; campus: string; status: string }; can_record: boolean; moves: ArrivedMove[] };
/** A line of the form as the engine takes it: the item's code, the quantity as it was typed. */
export type ArrivedLine = { material_code: string; quantity: string };

/** The standings of a claim that goods are recorded against (the engine's `ARRIVES`): only these claims are asked what arrived. */
export const ARRIVES: readonly string[] = ["approved", "paid"];

/** The sentences of a refusal, without the "Nothing was saved." that opens a refused call. */
export const sentences = (words: string): string[] =>
  words
    .replace(/^Nothing was saved\.\s*/, "")
    .split(/(?<=\.)\s+(?=[A-Z])/)
    .filter(Boolean);

/** Which sentence of a refused call is about which line: the engine names the item ("How many Chalk came in must be…", "There is no item MAT-9 in the…").
 *  → each line's own words (null where it has none), and the sentences about no line, which stand above the form. */
export function byLine(words: string, items: readonly ({ name: string; code: string } | null)[]): { lines: (string | null)[]; rest: string[] } {
  const lines: (string | null)[] = items.map(() => null);
  const rest: string[] = [];
  for (const s of sentences(words)) {
    const at = items.findIndex((it, i) => it && lines[i] === null && (s.startsWith(`How many ${it.name} came in`) || s.includes(` ${it.code} `)));
    if (at >= 0) lines[at] = s;
    else rest.push(s);
  }
  return { lines, rest };
}
