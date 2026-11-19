"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { afterDecision, moneyQueue, queueAt, said } from "@/lib/money-queue";

// To pay's one decision (CP-80): the engine records the payment (the date, how, the reference) if the person may pay this claim, by the rules it was filed under.
// Then the next claim opens by itself.
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function markPaid(f: FormData): Promise<never> {
  const me = await requireStaff();
  const id = text(f, "id");
  let refused: string | null = null;
  try {
    const res = await engineSend("/money/pay", { actor: me.email, id, paid_on: text(f, "paid_on"), mode: text(f, "mode"), ref: text(f, "ref") });
    if (!res.ok) refused = await said(res);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    refused = e.message;
  }
  if (refused) redirect(queueAt("pay", { open: id, said: refused }));
  revalidatePath("/money", "layout"); // the tabs' counts
  const left = await moneyQueue(me);
  redirect(queueAt("pay", { open: left.ok ? afterDecision(left.value.pay, text(f, "next")) : null, did: "paid" }));
}
