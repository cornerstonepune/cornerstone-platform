"use server";

import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { said } from "@/lib/money-queue";

// The two writes of the Catalogue (CP-84b): an item's category, and a word taught its category. One engine call each, the person's email as `actor`. Nothing is decided
// here: who may, which categories there are and which items a word sets are the engine's, and its refusal comes back in its own words.
export type Done = { ok: true } | { ok: false; error: string };
export type Taught = { ok: true; word: string; category: string; items_set: number } | { ok: false; error: string };

export async function changeCategory(code: string, category: string): Promise<Done> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/materials/items/category", { actor: me.email, material_code: code, category });
    return res.ok ? { ok: true } : { ok: false, error: await said(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, error: e.message };
    throw e;
  }
}

export async function teachWord(word: string, category: string): Promise<Taught> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/materials/words/set", { actor: me.email, word, category });
    if (!res.ok) return { ok: false, error: await said(res) };
    return { ok: true, ...((await res.json()) as { word: string; category: string; items_set: number }) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, error: e.message };
    throw e;
  }
}
