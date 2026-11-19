import type { State } from "@/components/status-chip";

// The words of the Stock screens, in one place (CP-82): what the engine sends, how an item's word is drawn, how a quantity and a month are said, and which field
// a refusal is about. Pure, so a client form and a page share it.
export type StockWord = "enough" | "low" | "none" | "count it";
export type StockItem = { code: string; name: string; unit: string; on_hand: number; minimum: number | null; word: StockWord };
export type BuyLine = { code: string; name: string; unit: string; need: number | null; on_hand: number; minimum: number | null; to_buy: number | null; sources: { class: string; activity: string | null }[] };
export type BuyList = { month: string; lines: BuyLine[]; classes_without_list: string[]; checklist_url: string | null };
/** One move of the ledger as the engine says it: the day, the sentence, and the first name of who made it. */
export type Move = { on: string; kind: string; words: string; by: string; material_code: string; item: string };
export type CountLine = { material_code: string; item: string; unit: string; expected: number; counted: number; difference: number };
export type Reasons = { count: string[]; writeoff: string[] };

/** An item's word as a chip: the engine's word, drawn on the one state scale (green enough, amber low or to be counted, red none). */
export const WORD_STATE: Record<StockWord, State> = { enough: "done", low: "waiting", none: "fixThis", "count it": "waiting" };

/** A quantity as the school writes it: whole where it is whole, else to the places it has ("2.5"), grouped the Indian way; a dash for none given. */
export function qty(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** The months a buy list can be asked for: the one before this, this one and the two that follow, as `YYYY-MM` and in words. */
export function monthChoices(today: string): (readonly [string, string])[] {
  const [y, m] = today.split("-").map(Number);
  return [-1, 0, 1, 2].map((d) => {
    const at = new Date(Date.UTC(y, m - 1 + d, 1));
    return [at.toISOString().slice(0, 7), at.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })] as const;
  });
}

/** The address of a Stock page with its choices: only what is set shows. */
export function stockAt(path: string, o: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export type Field = "quantity" | "class_label" | "claim" | "minimum" | "reason";

/** The field a refusal is about, so its words stand beside it; none for a refusal about the move as a whole. The engine's phrases start the same way each
 *  time, and an item's own name may hold any word, so only the start of a sentence says which field it is. */
export function fieldOf(words: string): Field | null {
  const says: [RegExp, Field][] = [
    [/^Say why /, "reason"],
    [/^Say which class|^There is no class called /, "class_label"],
    [/^That claim /, "claim"],
    [/^The minimum of /, "minimum"],
    [/^How many /, "quantity"],
  ];
  return says.find(([re]) => re.test(words))?.[1] ?? null;
}

/** The row of Stock tabs: each page of the store, for a person who keeps one. */
export const STOCK_TABS = [
  { href: "/stock", label: "On hand" },
  { href: "/stock/buy", label: "Buy list" },
  { href: "/stock/count", label: "Count" },
] as const;

/** A number as typed, or one the engine will refuse in its own words (a blank or a word is not a quantity, and a quantity below zero is never one): the web
 *  does not word that refusal, the engine does. */
export const typed = (text: string): number => {
  const n = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(n) ? n : -1;
};

/** The items of a refused count that need a reason, read from the engine's words ("Chalk: 5 counted, 20 in the books. Say why they differ."). */
export function needReason(refusal: string, names: readonly string[]): string[] {
  const parts = refusal.replace(/^Nothing was saved\.\s*/, "").split(/(?<=Say why they differ\.)\s+/);
  return names.filter((n) => parts.some((p) => p.startsWith(`${n}: `) && p.endsWith("Say why they differ.")));
}
