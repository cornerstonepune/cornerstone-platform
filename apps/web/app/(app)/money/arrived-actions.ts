"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import type { ArrivedLine } from "@/lib/arrived-words";
import { EngineDown, engineSend } from "@/lib/engine";
import { said } from "@/lib/money-queue";
import { typed } from "@/lib/stock-words";

// What arrived (CP-86): one engine call for the whole form, the person's email as `actor`. Nothing is decided here: the engine says who may, which line is wrong and
// that nothing was saved, in its own words, which come back to stand beside the line they name.
export type Arrives = { ok: true; recorded: number } | { ok: false; error: string };

export async function recordArrived(claim: string, lines: ArrivedLine[]): Promise<Arrives> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/stock/arrive", { actor: me.email, id: claim, lines: lines.map((l) => ({ material_code: l.material_code, quantity: typed(l.quantity) })) });
    if (!res.ok) return { ok: false, error: await said(res) };
    revalidatePath("/stock", "layout"); // what is on hand has changed
    return { ok: true, recorded: ((await res.json()) as { recorded: number }).recorded };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, error: e.message };
    throw e;
  }
}
