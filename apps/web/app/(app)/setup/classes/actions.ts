"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mayUse } from "@/lib/access";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { moveTargets } from "@/lib/queries-coordinator";

const UUID = /^[0-9a-f-]{36}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
type Said = { moved: boolean; refused?: string };

/** The coordinator moves one child to another class from a date (UI-5, Done when 4 and 9). The rule is the database's
 *  `move_child`: it closes the open enrolment, opens a new one and writes the change_log row, deletes nothing, and says why
 *  when it refuses. Checked here first, on the server: hiding the button is not the check. */
export async function moveFromClass(formData: FormData): Promise<void> {
  const me = await requireStaff();
  const back = String(formData.get("back") ?? "/setup/classes");
  const here = back.startsWith("/setup/classes") ? back.split("&moved")[0].split("&refused")[0] : "/setup/classes";
  const sep = here.includes("?") ? "&" : "?";
  if (!mayUse(me, "move_child")) redirect(`${here}${sep}refused=not_coordinator`);
  const id = String(formData.get("child_id") ?? "");
  const section = String(formData.get("section") ?? "").trim();
  const roll = String(formData.get("roll") ?? "").trim();
  const day = String(formData.get("from") ?? "");
  if (!UUID.test(id) || !DAY.test(day)) redirect(`${here}${sep}refused=nothing_changes`);
  const to = (await moveTargets()).find((t) => t.label === section);
  if (!to) redirect(`${here}${sep}refused=no_such_class`);
  const [{ said }] = await sql<{ said: Said }[]>`
    select move_child(${id}::uuid, ${to.gradeCode}, ${section}, ${roll}, ${me.email}, '',
      (${day}::date + time '12:00') at time zone (select value #>> '{}' from config where key = 'school.time_zone')) as said`;
  revalidatePath("/", "layout");
  if (!said.moved) redirect(`${here}${sep}${new URLSearchParams({ refused: said.refused ?? "", section, roll })}`);
  redirect(`${here}${sep}moved=1`);
}
