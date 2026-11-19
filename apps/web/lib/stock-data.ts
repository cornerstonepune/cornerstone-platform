import { EngineDown, engineSend } from "./engine";
import { sql } from "./db";
import { said, type Got } from "./money-queue";
import type { BuyList, Move, StockItem } from "./stock-words";

// What the Stock screens read from the engine (CP-82): the store's items with their word, an item's history in words, and a month's buy list. Every call
// is a POST that names the person (`actor`), reads included, as Money's do. Nothing is worked out here: the engine's numbers and words are shown as sent.

async function read<T>(path: "/stock/on-hand" | "/stock/history" | "/stock/buy-list", body: Record<string, string | undefined>): Promise<Got<T>> {
  try {
    const res = await engineSend(path, body as never);
    return res.ok ? { ok: true, value: (await res.json()) as T } : { ok: false, words: await said(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, words: e.message };
    throw e;
  }
}

export const onHand = (actor: string, campus: string) => read<{ campus: string; items: StockItem[] }>("/stock/on-hand", { actor, campus });
export const history = (actor: string, campus: string, material_code: string) => read<{ moves: Move[] }>("/stock/history", { actor, campus, material_code });
export const buyList = (actor: string, campus: string, month: string) => read<BuyList>("/stock/buy-list", { actor, campus, month });

/** The class labels the hand-out form suggests: the school's, the campus's own first (the campuses lend to each other, so any class may be named). */
export async function classLabels(campus: string): Promise<string[]> {
  const rows = await sql<{ label: string }[]>`
    select c.label from school_class c join campus k on k.id = c.campus_id
    group by c.label order by bool_or(k.name = ${campus}) desc, c.label limit 80`;
  return rows.map((r) => r.label);
}
