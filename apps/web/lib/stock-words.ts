import type { State } from "@/components/status-chip";

// The words of the Stock screens, in one place (CP-82): what the engine sends, how an item's word is drawn, how a quantity and a month are said, and which field
// a refusal is about. Pure, so a client form and a page share it.
export type StockWord = "enough" | "low" | "none" | "count it";
export type StockItem = { code: string; name: string; unit: string; on_hand: number | string; minimum: number | string | null; word: StockWord };
export type BuyLine = { code: string; name: string; unit: string; need: number | string | null; on_hand: number | string; minimum: number | string | null; to_buy: number | string | null; sources: { class: string; activity: string }[] };
export type BuyList = { lines: BuyLine[]; checklist_url: string | null };
export type Move = { at: string; words: string };

/** An item's word as a chip: the engine's word, drawn on the one state scale (green enough, amber low or to be counted, red none). */
export const WORD_STATE: Record<StockWord, State> = { enough: "done", low: "waiting", none: "fixThis", "count it": "waiting" };

/** A quantity as the school writes it: whole where it is whole, else to the places it has ("2.5"), grouped the Indian way; a dash for none given. */
export function qty(v: number | string | null | undefined): string {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
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

/** The field a refusal is about, so its words stand beside it; none for a refusal about the move as a whole. */
export function fieldOf(words: string): Field | null {
  const says: [RegExp, Field][] = [
    [/reason|why/i, "reason"],
    [/class/i, "class_label"],
    [/claim|expense/i, "claim"],
    [/minimum/i, "minimum"],
    [/quantity|how many|more than nothing|number|amount/i, "quantity"],
  ];
  return says.find(([re]) => re.test(words))?.[1] ?? null;
}

/** The row of Stock tabs: each page of the store, for a person who keeps one. */
export const STOCK_TABS = [
  { href: "/stock", label: "On hand" },
  { href: "/stock/buy", label: "Buy list" },
  { href: "/stock/count", label: "Count" },
] as const;
