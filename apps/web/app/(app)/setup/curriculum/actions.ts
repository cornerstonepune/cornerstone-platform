"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mayUse } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { curriculumChanged } from "@/lib/curriculum-cache";
import { mustBeOn } from "@/lib/curriculum-screens";
import { sql } from "@/lib/db";
import { enginePost } from "@/lib/engine";

// The two answers made on Curriculum (screens.json `curriculum`): a skill the machine offered for an activity, and a question the engine
// drafted. Each goes back to the screen that asked, under its own choices; `back` is that screen's address and nothing else.
const HERE = "/setup/curriculum";
// `+` is how a space in a unit's name travels in the address; without it a save sent the person back to the start (CP-70)
// back to Curriculum, or to the activity's own page where Approve this activity was pressed (CP-53)
const BACK = /^\/setup\/(curriculum|activities\/[A-Za-z0-9._%-]+)(\?[\w=&.%+-]*)?(#[\w-]*)?$/;
const backOf = (f: FormData) => {
  const given = String(f.get("back") ?? "");
  return BACK.test(given) ? given : HERE;
};

/** Yes adds the offered skills as links; no closes the offer. */
export async function answerOffer(form: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  await enginePost("/curriculum/offers/answer", { actor: me.email, id: String(form.get("id") ?? ""), yes: form.get("do") === "yes" });
  revalidatePath(HERE);
  curriculumChanged();
  redirect(backOf(form));
}

const CODE = /^[A-Za-z0-9._#-]+$/;

/** CP-51: a reviewer approves what the machine made for one activity or objective; the engine checks the gate as a write. */
export async function approveLinks(form: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const kind = form.get("kind") === "objective" ? "objective" : "activity";
  const code = String(form.get("code") ?? "");
  if (CODE.test(code)) await enginePost("/curriculum/approve", { actor: me.email, kind, code });
  revalidatePath(HERE);
  curriculumChanged();
  if (kind === "activity" && CODE.test(code)) revalidatePath(`/setup/activities/${code}`);
  redirect(backOf(form));
}

/** A person answers a question the engine drafted, in their own name: agreed as drafted, or corrected in their own
 *  words (goals/ny1-needs-you.yaml). Only a question still waiting is answered, so two people never overwrite each
 *  other; `engine asks` prints the answer for whoever builds next. */
export async function answerAsk(formData: FormData): Promise<void> {
  const me = await requireStaff();
  const code = String(formData.get("code") ?? "");
  const correction = String(formData.get("correction") ?? "").trim();
  const corrected = formData.get("answer") === "corrected";
  const back = backOf(formData);
  const [path, tail = ""] = back.split("#");
  if (!CODE.test(code) || (corrected && !correction)) redirect(corrected ? `${path}${path.includes("?") ? "&" : "?"}empty=1${tail ? `#${tail}` : ""}` : back);
  // each question is drafted for a role (`ask.for_role`); the coordinator may answer any
  const [ask] = await sql<{ for_role: string }[]>`select for_role from ask where code = ${code}`;
  if (ask && !mayUse(me, "any_ask") && me.role !== ask.for_role) redirect(`/refused?kind=asks&role=${ask.for_role}`);
  await sql`
    update ask set answer = ${corrected ? "corrected" : "agreed"}, correction = ${corrected ? correction : null},
                   answered_by = ${me.name}, answered_at = now()
    where code = ${code} and answer is null`;
  revalidatePath(HERE);
  curriculumChanged();
  revalidatePath("/today");
  redirect(back);
}

// CP-70: a coordinator edits an objective in place. The engine decides who may (coordinators only) and writes the history; each action here
// goes back to the screen that asked and tells the kept reads, so the tree shows the change at once (lib/curriculum-cache.ts).
const GRADE = /^[A-Za-z0-9]{1,4}$/;

async function edited(back: string): Promise<never> {
  revalidatePath(HERE);
  curriculumChanged();
  redirect(back);
}

/** An objective's title, subject and unit. */
export async function saveObjective(form: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const code = String(form.get("code") ?? "");
  const changes: Record<string, string> = { title: String(form.get("title") ?? ""), unit: String(form.get("unit") ?? "") };
  const subject = String(form.get("subject") ?? "");
  if (subject) changes.subject_code = subject;
  if (CODE.test(code)) await enginePost("/curriculum/edit/objective", { actor: me.email, code, changes });
  return edited(backOf(form));
}

/** Put an objective in one more grade, or take it out of one. The engine keeps at least one grade on it. */
export async function changeObjectiveGrade(form: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const code = String(form.get("code") ?? "");
  const grade = String(form.get("grade") ?? "");
  const path = form.get("do") === "remove" ? "/curriculum/edit/grade/remove" : "/curriculum/edit/grade/add";
  if (CODE.test(code) && GRADE.test(grade)) await enginePost(path, { actor: me.email, kind: "objective", code, grade });
  return edited(backOf(form));
}
