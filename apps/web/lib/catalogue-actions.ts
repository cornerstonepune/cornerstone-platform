"use server";

import { requireStaff } from "@/lib/auth";
import { searchItems } from "@/lib/catalogue-data";
import type { Found, Item } from "@/lib/catalogue-words";
import { EngineDown, engineSend } from "@/lib/engine";
import { said } from "@/lib/money-queue";

// What the item picker asks of the engine from the browser (CP-84b): search the one list, and add an item to it. The person's email is the `actor`; nothing is
// decided here, and the engine's refusal comes back in its own words, to stand beside the field it names.
export type Searched = { ok: true; found: Found } | { ok: false; error: string };
export type Added = { ok: true; item: Item; created: boolean; close: { code: string; name: string }[] } | { ok: false; error: string };

export async function findItems(q: string): Promise<Searched> {
  const me = await requireStaff();
  const got = await searchItems(me.email, q);
  return got.ok ? { ok: true, found: got.value } : { ok: false, error: got.words };
}

/** "Not in the list? Add it": the name, the unit and the category, all three. The engine returns the item that already has these words, as it is, when there is one. */
export async function addItem(v: { name: string; unit: string; category: string }): Promise<Added> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/materials/items/add", { actor: me.email, name: v.name.trim(), unit: v.unit.trim(), category: v.category });
    if (!res.ok) return { ok: false, error: await said(res) };
    const { created, close, ...item } = (await res.json()) as Item & { created: boolean; close: { code: string; name: string }[] };
    return { ok: true, item, created, close };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, error: e.message };
    throw e;
  }
}
