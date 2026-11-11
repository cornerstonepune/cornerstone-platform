import { sql, TENANT_SLUG } from "./db";
import { sendFirstLink } from "./password-actions";
import { rolesHeld } from "./queries-staff";

// Adding a member of staff (goals/auth-email-password.yaml), the one rule `/setup/staff` uses. Nobody types or
// sees anyone else's password: the person is put on the list without one and emailed a link that lets them set their own, good for
// `password_link.first_days` days. Their classes and subjects come after, from their grants. The caller has already checked that the
// person asking may change the staff list.

/** Why nobody was added, in the words the coordinator reads. */
export const NOT_ADDED: Record<string, string> = {
  email: "a name and a school email are both needed",
  role: "that role is not one the school names",
  already: "that email is already on the staff list",
};

export type Added = { added: true } | { added: false; why: keyof typeof NOT_ADDED };

export async function addStaff(form: FormData): Promise<Added> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "").trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { added: false, why: "email" };
  if (!(await rolesHeld()).includes(role)) return { added: false, why: "role" };
  // one statement, and it does nothing at all if that email is already on the list: two coordinators adding at once cannot write one
  // person over the other (`staff_add`; someone taken off before is put back, with their own id)
  const [done] = await sql<{ added: boolean }[]>`select public.staff_add(${TENANT_SLUG}, ${email}, ${name}, ${role}) as added`;
  if (!done?.added) return { added: false, why: "already" };
  await sendFirstLink(email);
  return { added: true };
}
