"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { EXT_OF, engineWords, fieldOf, type Field } from "@/lib/money-claims";

// The writes of My claims and File a claim: one engine call each, the person's email as `actor`. Nothing is decided here; a refusal comes
// back in the engine's own words, beside the field it is about.
export type Filing = { error: string; field: Field | null };
export type Sent = { amount: string; spent_on: string; vendor: string; category: string; campus: string; note: string; bill: { b64: string; ext: string } | null; from: string | null };

const down = (e: unknown): string => {
  if (e instanceof EngineDown) return e.message;
  throw e;
};

export async function fileClaim(sent: Sent): Promise<Filing> {
  const me = await requireStaff();
  let id: string;
  try {
    // filing a sent-back claim again keeps its bill unless a new one is chosen
    let bill = sent.bill;
    if (!bill && sent.from) {
      const had = await engineSend("/money/claims/bill", { actor: me.email, id: sent.from });
      if (had.ok) {
        const got = (await had.json()) as { content_type: string; b64: string };
        bill = { b64: got.b64, ext: EXT_OF[got.content_type] ?? "" };
      }
    }
    const res = await engineSend("/money/claims/create", {
      actor: me.email,
      amount: sent.amount.trim(),
      spent_on: sent.spent_on,
      vendor: sent.vendor,
      category: sent.category,
      campus: sent.campus,
      note: sent.note,
      bill_b64: bill?.b64 ?? null,
      bill_ext: bill?.ext ?? "",
    });
    if (!res.ok) {
      const error = await engineWords(res, "That was not filed.");
      return { error, field: fieldOf(error) };
    }
    id = ((await res.json()) as { id: string }).id;
  } catch (e) {
    return { error: down(e), field: null };
  }
  redirect(`/money?open=claim:${id}&filed=1`);
}

/** The claim's bill, added later: → the words when it was refused, else nothing. */
export async function addBill(id: string, bill: { b64: string; ext: string }): Promise<string | null> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/money/claims/add_bill", { actor: me.email, id, bill_b64: bill.b64, bill_ext: bill.ext });
    if (!res.ok) return await engineWords(res, "The bill was not added.");
  } catch (e) {
    return down(e);
  }
  revalidatePath("/money");
  return null;
}

export async function withdrawClaim(form: FormData): Promise<void> {
  const me = await requireStaff();
  const id = String(form.get("id") ?? "");
  const at = (q: string) => redirect(`/money?open=claim:${encodeURIComponent(id)}&${q}`);
  let said: string | null = null;
  try {
    const res = await engineSend("/money/claims/withdraw", { actor: me.email, id });
    if (!res.ok) said = await engineWords(res, "That was not withdrawn.");
  } catch (e) {
    said = down(e);
  }
  return at(said ? `error=${encodeURIComponent(said)}` : "said=withdrawn");
}
