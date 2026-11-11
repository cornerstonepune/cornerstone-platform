"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { namesMayShow } from "@/lib/queries-coordinator";
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
