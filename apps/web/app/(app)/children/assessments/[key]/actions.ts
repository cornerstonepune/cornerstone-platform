"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deciding, mustBeMine, mustSee } from "@/lib/decides";
import { sql } from "@/lib/db";
import { EngineDown, engineSend, markWhatTrustSettles } from "@/lib/engine";
import { levels } from "@/lib/levels";
import { assessmentHref } from "@/lib/assessment-ui";
import { prescriptionSection } from "@/lib/scope";

// What an educator says on one assessment: approve THIS pack, change ONE child's level before print, sign ONE paper off.
// Each acts on one pack or one row, never on several (UI-4 Done when 11).

const UUID = /^[0-9a-f-]{36}$/;
const KEY = /^(practice|assessment|focus|custom|earlier)~[^~]{0,60}~[^~]{0,20}~.{0,2000}$/;
const WEEK = /^\d{4}-W\d{2}$/;

const keyOf = (f: FormData) => {
  const key = String(f.get("key") ?? "");
  if (!KEY.test(key)) redirect("/children/assessments");
  return key;
};
const go = (key: string, said?: string) => redirect(`${assessmentHref(key)}${said ? `?said=${encodeURIComponent(said.slice(0, 200))}` : ""}`);

/** This pack approved in the signer's name: the engine approves the class's papers of that kind and week, once. */
export async function approveThisPack(f: FormData): Promise<void> {
  const key = keyOf(f);
  const [kind, section, week] = key.split("~");
  const me = await deciding(kind === "focus" ? "home_papers" : "class_papers");
  if (!section || !WEEK.test(week)) redirect(assessmentHref(key));
  await mustBeMine(me, kind === "focus" ? "home_papers" : "class_papers", [section]);
  let said: string | undefined;
  try {
    const res = await engineSend("/week/approve", { section, week, kind, by: me.email });
    if (!res.ok) said = `The engine refused that (${res.status}). Nothing was approved.`;
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    said = "The engine is not answering; nothing was approved.";
  }
  revalidatePath("/children/assessments");
  go(key, said);
}

/** One child's level changed before print; kept as an override with who and why (the prescriber leaves that child alone). */
export async function changeLevel(f: FormData): Promise<void> {
  const key = keyOf(f);
  const sheet = String(f.get("sheet") ?? "");
  const difficulty = String(f.get("difficulty") ?? "");
  const me = await deciding("class_papers");
  if (!UUID.test(sheet)) redirect(assessmentHref(key));
  const [p] = await sql<{ id: string }[]>`select id from prescription where sheet_instance_id = ${sheet}::uuid limit 1`;
  if (!p) redirect(assessmentHref(key));
  await mustBeMine(me, "class_papers", [await prescriptionSection(p.id)]);
  if (!(await levels()).order.includes(difficulty)) redirect(assessmentHref(key));
  await sql`
    update prescription set difficulty = ${difficulty}, rule_fired = 'override', override_by = ${me.email},
      override_reason = 'changed on the assessment before print', updated_at = now()
    where id = ${p.id}::uuid`;
  revalidatePath(assessmentHref(key));
  go(key);
}

/** One paper signed off: every answer on it becomes evidence in the signer's name. This paper only. */
export async function signOffPaper(f: FormData): Promise<void> {
  const key = keyOf(f);
  const me = await deciding("papers");
  const paper = String(f.get("paper_id") ?? "");
  if (!UUID.test(paper)) redirect(assessmentHref(key));
  await mustSee(me, "papers", [{ sheet: paper }]);
  const [own] = await sql<{ child: string | null; left: number }[]>`
    select si.child_id as child,
           (select count(*)::int from item_result r join capture c on c.id = r.capture_id
             where c.sheet_instance_id = si.id and c.superseded_by is null and r.status = 'needs_teacher') as left
    from sheet_instance si where si.id = ${paper}::uuid`;
  if (!own?.child) redirect("/refused?kind=papers&paper=1");
  // never while an answer is left for a person to judge
  if (own.left > 0) go(key, "Answers are still left to judge on that paper; nothing was signed off.");
  await sql`
    select coalesce(sum(confirm_results(${own.child}::uuid, ${me.email}, c.id)), 0)::int
      from capture c where c.sheet_instance_id = ${paper}::uuid and c.superseded_by is null`;
  await markWhatTrustSettles();
  revalidatePath("/children/assessments");
  revalidatePath(`/growth/${own.child}`);
  go(key);
}
