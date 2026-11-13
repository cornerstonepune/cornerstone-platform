"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mayUse } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { mustBeOn } from "@/lib/curriculum-screens";
import { sql } from "@/lib/db";
import { enginePost } from "@/lib/engine";

// The two answers made on Curriculum (screens.json `curriculum`): a skill the machine offered for an activity, and a question the engine
// drafted. Each goes back to the screen that asked, under its own choices; `back` is that screen's address and nothing else.
const HERE = "/setup/curriculum";
const BACK = /^\/setup\/curriculum(\?[\w=&.%-]*)?(#[\w-]*)?$/;
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
  redirect(backOf(form));
}

const CODE = /^[A-Za-z0-9._#-]+$/;

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
  revalidatePath("/today");
  redirect(back);
}
