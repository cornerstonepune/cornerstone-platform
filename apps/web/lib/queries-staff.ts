import { sql } from "./db";
import { staffList, type Staff } from "./queries";

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
