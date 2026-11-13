// The class picture as the page charter's B5 draws it: each child a card coloured by their state on the chosen skill, or on every skill at once,
// and the four stat tiles that count them. Pure: no database, no React, so a plain test can hold every rule. A state is the graph's row
// (`child_skill_state`) read through the school's colour of it (`child_state.colour`, lib/state-scale.ts `colourState`); nothing here decides one.
import type { GridCell } from "@/components/class-grid";
import { STATES, rowOf } from "@/components/status-chip";
import { SCALE, colourState, weakestOf, type ScaleState } from "./state-scale";
import { initialsOf } from "./children-view";

export type PictureCell = { colour: string; words: string };
export type PictureKid = { id: string; roll: string; name: string };
export type Card = { id: string; roll: string; first: string; initials: string; state: ScaleState; words: string; seen: boolean };

/** A card's tint for its state. A child's card is never red (DESIGN.md §3, docs/frontend/SPEC.md: "a child's square is never red, whatever
 *  the mark"): a child who needs help is amber, told apart from practising by the needs-help icon and words. Grey with a ring when a row says
 *  too few yet; dashed when there is no row at all. */
export function cardLook(state: ScaleState, seen: boolean): GridCell["look"] {
  if (state === SCALE[0]) return "ok";
  if (state === SCALE[3]) return seen ? "quiet" : "unseen";
  return "wait";
}

/** Each child's card on `skill` (a skill code), or on every skill when `skill` is null: the state that most needs the educator among theirs
 *  (lib/state-scale.ts `weakestOf`). The words are the engine's row's own on one skill ("under half right"), the scale's on every skill. */
export function cardsOf(kids: readonly PictureKid[], cells: ReadonlyMap<string, ReadonlyMap<string, PictureCell>>, skill: string | null): Card[] {
  return kids.map((k) => {
    const mine = [...(cells.get(k.id)?.entries() ?? [])].filter(([code]) => skill === null || code === skill).map(([, c]) => c);
    const base = { id: k.id, roll: k.roll, first: k.name.split(/\s+/)[0] ?? "", initials: initialsOf(k.name), seen: mine.length > 0 };
    if (!mine.length) return { ...base, state: SCALE[3], words: STATES[SCALE[3]].words };
    const state = weakestOf(mine.map((c) => colourState(c.colour)));
    const words = skill !== null ? mine[0].words : state === SCALE[3] ? mine[0].words : STATES[state].words;
    return { ...base, state, words };
  });
}

/** A card as the class grid draws it: Sr. No., initials, first name, and the state's icon and words. */
export const cellOf = (c: Card, href: string, chosen: boolean): GridCell => ({
  key: c.roll,
  no: c.roll,
  initials: c.initials,
  name: c.first,
  look: cardLook(c.state, c.seen),
  icon: rowOf(c.state).icon,
  words: c.words,
  href,
  attrs: { "data-roll": c.roll, "data-open-key": `child:${c.roll}`, "data-scale": c.state, ...(chosen ? { "aria-current": "true" } : {}) },
});

/** The four tiles: how many children are at each place on the scale, in the scale's order. Every child is counted once. */
export function tilesOf(cards: readonly Card[]): { state: ScaleState; n: number }[] {
  return SCALE.map((state) => ({ state, n: cards.filter((c) => c.state === state).length }));
}
