import { sql } from "./db";
import { staffList, type Staff } from "./queries";

// Who teaches which class, read for the Staff and School pages (goals/uxn2-staff-and-school.yaml). A person's password
// hash comes with the list (`staffList`) and never leaves the server: only the name, email, role and classes are read here.
export type Person = {
  /** The staff id: the name opens that person on Staff and classes (`/setup/staff?person=`). */
  id?: string;
  email: string;
  name: string;
  role: string;
  classes: string[];
  /** The subject codes they teach; none named is every subject (nav_teacher_scope_and_todo). */
  subjects: string[];
};

export async function people(): Promise<Person[]> {
  return (await staffList()).map((s) => ({
    id: s.id,
    email: s.email,
    name: s.name,
    role: s.role,
    classes: [...(s.classes ?? [])].sort(),
    subjects: [...(s.subjects ?? [])].sort(),
  }));
}

/** The roles a person may be given on the Staff page: those the school's decisions name (`people.decides`), and any
 *  someone on the list already holds — the same rule as `engine staff add` (engine/core/staff.py `roles`). Rows,
 *  never a list in code (rule 1). */
export async function rolesHeld(): Promise<string[]> {
  const [row] = await sql<{ value: Record<string, string[]> }[]>`
    select value from config where key = 'people.decides'`;
  const named = Object.values(row?.value ?? {}).flat();
  const held = (await staffList()).map((p: Staff) => p.role);
  return [...new Set([...named, ...held])].sort();
}
