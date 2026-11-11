"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deciding, mustSee } from "@/lib/decides";
import { EngineDown, enginePost, engineSend } from "@/lib/engine";
import { paperHref } from "@/lib/assessment-ui";

const UUID = /^[0-9a-f-]{36}$/;

/** A person says what the child actually wrote for ONE answer (empty: the child wrote nothing, so blank, never wrong). The
 *  engine marks it; the person's word is a new `read_correction` row beside the engine's own read, which stays as it was. */
export async function sayWhatWasWritten(f: FormData): Promise<void> {
  const me = await deciding("answers");
  const key = String(f.get("key") ?? "");
  const roll = String(f.get("roll") ?? "");
  const result = String(f.get("result_id") ?? "");
  const paper = String(f.get("paper_id") ?? "");
  const blank = f.get("blank") !== null;
  const wrote = blank ? "" : String(f.get("human_read") ?? "").trim().slice(0, 40);
  if (!UUID.test(result) || !UUID.test(paper) || !key || !roll) redirect("/children/assessments");
  await mustSee(me, "answers", [{ result }, { sheet: paper }]);
  const here = paperHref(key, roll);
  if (!blank && !wrote) redirect(`${here}?answer=${result}`);
  try {
    await enginePost("/capture/correct", { result_id: result, human_read: wrote, by: me.email });
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    redirect(`${here}?said=${encodeURIComponent("The engine is not answering; nothing was changed.")}`);
  }
  revalidatePath(here);
  redirect(here);
}

// ---- a copy before it prints: a question taken off or put on, and the paper approved (the old review page's controls) ----
// The engine holds every rule (`w2_print/edit_paper.py`): what may change, the limits, the new code and the edit's own row. An edit makes the paper
// again with a new code; a copy is addressed by its Sr. No., so the address does not move. A home assessment's paper only (`home_papers`).

const QR = /^CS[0-9A-F]{6}$/;
const ITEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const said = async (res: Response) => ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? `The engine answered ${res.status}.`;
function backTo(f: FormData, q: Record<string, string | string[]>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) for (const x of [v].flat()) s.append(k, x);
  return `${paperHref(String(f.get("key") ?? ""), String(f.get("roll") ?? ""))}?${s}`;
}

/** One question off this copy, or one from the bank onto it. A refusal stays here and says why. */
export async function changeThisPaper(f: FormData): Promise<void> {
  const me = await deciding("home_papers");
  const qr = String(f.get("qr") ?? "");
  const item = String(f.get("item_id") ?? "");
  const what = f.get("what") === "add" ? "add" : "remove";
  const at = Number(f.get("at") ?? "") || null;
  if (!QR.test(qr) || !ITEM.test(item) || !f.get("key") || !f.get("roll")) redirect("/children/assessments");
  await mustSee(me, "papers", [{ qr }]);
  const res = await engineSend(`/paper/${qr}/${what}`, { by: me.email, item_id: item, at });
  if (!res.ok) redirect(backTo(f, { error: await said(res) }));
  const out = (await res.json()) as { qr: string; n: number; withdrew_approval: boolean; uncovered: string[] };
  revalidatePath(paperHref(String(f.get("key")), String(f.get("roll"))));
  redirect(backTo(f, { done: what, n: String(out.n), ...(out.withdrew_approval ? { withdrew: "1" } : {}), gone: out.uncovered }));
}

/** This copy approved in the educator's name: from now on it may be printed. */
export async function approveThisPaper(f: FormData): Promise<void> {
  const me = await deciding("home_papers");
  const qr = String(f.get("qr") ?? "");
  if (!QR.test(qr) || !f.get("key") || !f.get("roll")) redirect("/children/assessments");
  await mustSee(me, "papers", [{ qr }]);
  const res = await engineSend(`/paper/${qr}/approve`, { by: me.email });
  revalidatePath(paperHref(String(f.get("key")), String(f.get("roll"))));
  redirect(backTo(f, res.ok ? { done: "approved" } : { error: await said(res) }));
}
