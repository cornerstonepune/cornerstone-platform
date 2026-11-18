import { sql } from "./db";
import { staffNames } from "./timetable-ui";

// CP-74: whether a coordinator has said a grade's subject is in the right teaching order (an `approval` row of kind `objective_order`,
// target `<grade>~<subject>`; the newest word wins, and it can be taken back). Until it is said, the picker offers the whole subject.
export type OrderChecked = { by: string; on: string };

/** Each grade and subject whose order stands as checked, by `<grade>~<subject>`: who said so (by name, through the staff list) and when. */
export async function orderChecked(): Promise<Record<string, OrderChecked>> {
  const rows = await sql<{ target: string; decision: string; by: string; on: string }[]>`
    select distinct on (target) target, decision, "by", created_at::date::text as on from approval where kind = 'objective_order' order by target, seq desc`;
  const names = await staffNames();
  return Object.fromEntries(rows.filter((r) => r.decision === "approved").map((r) => [r.target, { by: names.get(r.by) ?? "a coordinator", on: r.on }]));
}
