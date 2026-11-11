"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deciding, mustSee } from "@/lib/decides";
import { EngineDown, enginePost, engineSend } from "@/lib/engine";
import { paperHref } from "@/lib/assessment-ui";
import { sql } from "@/lib/db";

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

// ---- the old Marking card's tools for ONE answer, on the paper screen: the right answer changed for every child, the mistake named, the page chosen, the answer judged ----

const here = (f: FormData, q = "", answer = "") => `${paperHref(String(f.get("key") ?? ""), String(f.get("roll") ?? ""))}${q ? `?${q}` : ""}${answer ? `#a-${answer}` : ""}`;
const ids = (f: FormData) => {
  const result = String(f.get("result_id") ?? "");
  const paper = String(f.get("paper_id") ?? "");
  if (!UUID.test(result) || !UUID.test(paper) || !f.get("key") || !f.get("roll")) redirect("/children/assessments");
  return { result, paper };
};

/** An educator changes the right answer of a question, for every child (ADR 0045). Code checks it first and, refusing, says why in its own
 *  words; otherwise every child's answer to it is marked again, and the page says how many were and how many keep a person's mark. */
export async function changeThisKey(f: FormData): Promise<void> {
  const me = await deciding("questions");
  const { result, paper } = ids(f);
  const slot = String(f.get("slot") ?? "").slice(0, 12);
  const answer = String(f.get("answer") ?? "").trim().slice(0, 40);
  await mustSee(me, "questions", [{ result }, { sheet: paper }]);
  let to: string;
  try {
    const res = await engineSend("/paper/key", { result_id: result, answer, by: me.email });
    const body = (await res.json().catch(() => ({}))) as { detail?: string; now?: string; changed?: unknown[]; left?: unknown[]; unseen?: number };
    const n = (body.changed?.length ?? 0) + (body.unseen ?? 0);
    to = res.ok
      ? here(f, `answer=${result}&key=${encodeURIComponent(`${slot}|${body.now ?? answer}|${n}|${body.left?.length ?? 0}`)}`, result)
      : here(f, `answer=${result}&error=${encodeURIComponent((body.detail ?? `refused (${res.status})`).slice(0, 200))}`, result);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    to = here(f, `answer=${result}&error=engine`, result);
  }
  revalidatePath(here(f));
  redirect(to);
}

/** A person names the mistake behind a wrong answer no named mistake explains: one press on Jev's shortlist, another named mistake, or none. */
export async function nameThisMistake(f: FormData): Promise<void> {
  const me = await deciding("answers");
  const { result, paper } = ids(f);
  const code = String(f.get("code") ?? "").slice(0, 80);
  if (!code) redirect(here(f, `answer=${result}`));
  await mustSee(me, "answers", [{ result }, { sheet: paper }]);
  let proposed: unknown[][] = [];
  try {
    const sent: unknown = JSON.parse(String(f.get("proposed") ?? "[]"));
    if (Array.isArray(sent)) proposed = sent.filter((x): x is unknown[] => Array.isArray(x));
  } catch {
    proposed = [];
  }
  let why = "";
  try {
    const res = await engineSend("/capture/mistake", { result_id: result, code, by: me.email, proposed });
    if (!res.ok) why = ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? `refused (${res.status})`;
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    why = "the engine could not be reached";
  }
  revalidatePath(here(f));
  redirect(here(f, `answer=${result}${why ? `&error=${encodeURIComponent(why.slice(0, 200))}` : ""}`, result));
}

/** A person says a page the engine doubts is, or is not, the child's: a new row each time, the latest standing. */
export async function chooseThisPage(f: FormData): Promise<void> {
  const me = await deciding("answers");
  const { result } = ids(f);
  const capture = String(f.get("capture_id") ?? "");
  const page = Number(f.get("file_page"));
  const choice = String(f.get("choice") ?? "");
  if (!UUID.test(capture) || !Number.isInteger(page) || !["theirs", "not_theirs"].includes(choice)) redirect(here(f, `answer=${result}`));
  await mustSee(me, "answers", [{ result }]);
  try {
    await enginePost("/paper/page-choice", { capture_id: capture, file_page: page, choice, by: me.email });
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    redirect(here(f, `answer=${result}&error=engine`, result));
  }
  revalidatePath(here(f));
  redirect(here(f, `answer=${result}`, result));
}

/** The few answers code cannot mark (a comparison symbol, "find the mistake"): only a person can say right, wrong or blank. This answer is settled and
 *  nothing else on the paper is signed off; who judged it is kept as a `read_correction` row whose reading is the engine's own, unchanged. */
export async function judgeThisOne(f: FormData): Promise<void> {
  const me = await deciding("answers");
  const { result, paper } = ids(f);
  const status = String(f.get("status") ?? "");
  if (!["correct", "wrong", "blank"].includes(status)) redirect(here(f, "error=judge"));
  await mustSee(me, "answers", [{ result }, { sheet: paper }]);
  // one statement, so the judgement and the record of who made it land together or not at all
  await sql`
    with judged as (
      update item_result set status = ${status}, misconception_codes = '{}', updated_at = now()
      where id = ${result}::uuid and state = 'candidate' and status = 'needs_teacher'
      returning tenant_id, capture_id, coalesce(raw_read::jsonb ->> 'child_answer', '') as read
    )
    insert into read_correction (tenant_id, child_id, capture_id, item_result_id, model_read, human_read, by, judged)
    select j.tenant_id, si.child_id, c.id, ${result}::uuid, j.read, j.read, ${me.email}, ${status}
    from judged j join capture c on c.id = j.capture_id join sheet_instance si on si.id = c.sheet_instance_id`;
  revalidatePath(here(f));
  redirect(here(f));
}
