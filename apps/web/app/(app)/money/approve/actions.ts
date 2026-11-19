"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { afterDecision, moneyQueue, queueAt, said } from "@/lib/money-queue";

// To approve's two decisions (CP-80): the engine decides, with the person's email as `actor`; its refusal comes back in its own words, beside the claim. After a
// decision the next claim opens by itself (the one that followed it, if it still waits), so a pile is cleared without going back to the list.
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function decide(f: FormData, did: "approved" | "sent_back"): Promise<never> {
  const me = await requireStaff();
  const id = text(f, "id");
  let refused: string | null = null;
  try {
    const res = await (did === "approved" ? engineSend("/money/approve", { actor: me.email, id }) : engineSend("/money/send_back", { actor: me.email, id, reason: text(f, "reason") }));
    if (!res.ok) refused = await said(res);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    refused = e.message;
  }
  if (refused) redirect(queueAt("approve", { open: id, said: refused }));
  revalidatePath("/money", "layout"); // the tabs' counts
  const left = await moneyQueue(me);
  redirect(queueAt("approve", { open: left.ok ? afterDecision(left.value.approve, text(f, "next")) : null, did }));
}

export const approve = async (f: FormData) => decide(f, "approved");
export const sendBack = async (f: FormData) => decide(f, "sent_back");
