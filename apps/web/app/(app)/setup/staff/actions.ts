"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { namesMayShow } from "@/lib/queries-coordinator";
import { writeGrant, type Said } from "@/lib/grants";
import { addStaff } from "@/lib/staff-add";

/** The coordinator adds a member of staff on Staff and classes (the one rule is `lib/staff-add.ts`, shared with the old Staff page). Checked
 *  here, on the server, first: hiding the button is not the check. The person is put on the list with no password and emailed a link to
 *  set their own; the address carries no name. */
export async function addPersonHere(formData: FormData): Promise<void> {
  await requireStaff();
  if (!(await namesMayShow())) redirect("/setup/staff?denied=1");
  const done = await addStaff(formData);
  if (!done.added) redirect(`/setup/staff?refused=${done.why}`);
  revalidatePath("/", "layout");
  redirect("/setup/staff?added=1");
}

const NOT_YOURS = "Only the coordinators can change who holds a class.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** The coordinator gives a person a class role on Staff and classes, from today (`POST /staff/grants/give`). The engine owns the rules and
 *  answers in the grant table's own words: they come back as the form's message, never in the address. Checked here first: hiding the
 *  button is not the check. */
export async function giveGrant(_before: Said, form: FormData): Promise<Said> {
  const me = await requireStaff();
  if (!(await namesMayShow())) return { ok: false, said: NOT_YOURS };
  const staff = text(form, "staff_id");
  if (!UUID.test(staff)) return { ok: false, said: "Choose a person from the list." };
  const subject = text(form, "subject");
  const reason = text(form, "reason");
  const said = await writeGrant(
    "/staff/grants/give",
    { actor: me.email, staff_id: staff, role: text(form, "role"), class_label: text(form, "class"), subject: subject || null, reason: reason || null },
    "Given from today.",
  );
  if (said?.ok) revalidatePath("/", "layout");
  return said;
}

/** The coordinator ends a grant today (`POST /staff/grants/end`): the row stays, with its dates; nothing is deleted. */
export async function endGrant(_before: Said, form: FormData): Promise<Said> {
  const me = await requireStaff();
  if (!(await namesMayShow())) return { ok: false, said: NOT_YOURS };
  const grant = text(form, "grant_id");
  if (!UUID.test(grant)) return { ok: false, said: "That grant is not on the list." };
  const said = await writeGrant("/staff/grants/end", { actor: me.email, grant_id: grant }, "Ended today. The grant stays on the list, with its dates.");
  if (said?.ok) revalidatePath("/", "layout");
  return said;
}
