import { cache } from "react";
import { EngineDown, engineSend } from "./engine";
import { said, type Got } from "./money-queue";
import type { CommonWord, Found } from "./catalogue-words";

// What the Catalogue page and the item picker read from the engine (CP-84b): the one list of materials, searched, and the words its uncategorised items end in. Every
// call is a POST that names the person (`actor`), as Money's and Stock's are. Nothing is worked out here: the engine's groups, names and words are shown as sent.

/** The items matching what was typed (all of them with nothing typed), by category. */
export async function searchItems(actor: string, q?: string): Promise<Got<Found>> {
  try {
    const res = await engineSend("/materials/items/search", { actor, q: q?.trim() || null });
    return res.ok ? { ok: true, value: (await res.json()) as Found } : { ok: false, words: await said(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, words: e.message };
    throw e;
  }
}

/** The words the items with no category most often end in, for "Teach a word". */
export const commonWords = cache(async (actor: string): Promise<Got<CommonWord[]>> => {
  try {
    const res = await engineSend("/materials/words/common", { actor });
    return res.ok ? { ok: true, value: ((await res.json()) as { words: CommonWord[] }).words } : { ok: false, words: await said(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, words: e.message };
    throw e;
  }
});
