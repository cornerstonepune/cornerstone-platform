// The rows the U94 specs read (the curriculum Workspace and CP-48's machine symbol and origin filter): three K2 activities and two
// objectives of the specs' own, each part and link with a known origin. Placeholder words only; no child's or staff member's name.
// Written as the owner; a second run puts the same rows back as they were.
import type { Sql } from "postgres";

export const MACHINE = "ACT-K2-U94-1"; // the machine drafted its thinking and linked its objective and a skill
export const SHEET = "ACT-K2-U94-2"; // everything from the school's sheet
export const PERSON = "ACT-K2-U94-3"; // a person wrote its steps
export const LO_MACHINE = "LO-U94-M"; // an objective the machine made, linked by the machine
export const LO_SHEET = "LO-U94-S"; // an objective from the sheet, linked from the sheet
export const NAMES = { [MACHINE]: "U94 counting by machine", [SHEET]: "U94 sorting from the sheet", [PERSON]: "U94 rhyming by a person" } as const;
export const SLIPS = [{ keyword: "Counts twice", spot: "points at one block two times" }];

const mark = (sql: Sql, t: string, code: string, part: string, source: string) =>
  sql`insert into change_log (tenant_id, table_name, row_id, op, after, origin) values (${t}, 'activity', ${code}, 'part_source', ${sql.json({ part, source, check_me: false })}, 'u94 test')`;

export async function u94Rows(sql: Sql): Promise<{ tenant: string; skills: { code: string; name: string }[] }> {
  const [{ id: t }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const skills = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${t} order by code limit 2`;
  for (const [code, strand] of [[MACHINE, "Maths"], [SHEET, "Maths"], [PERSON, "Language"]] as const) {
    await sql`
      insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, materials, steps, thinking, level_0, level_1, level_2, level_3)
      values (${t}, ${code}, 'K2', ${strand}, ${NAMES[code]}, '', 'U94 what it is for', 'Blocks', 'Lay out the blocks', 'U94 the school wrote this', 'U94 zero', 'U94 one', 'U94 two', 'U94 three')
      on conflict (tenant_id, code) do update set objective = excluded.objective, steps = excluded.steps, thinking = excluded.thinking, steps_list = null, thinking_doc = null`;
    for (const p of ["objective", "materials", "steps", "thinking", "level_0", "level_1", "level_2", "level_3"]) await mark(sql, t, code, p, "school");
  }
  // the machine's thinking: an idea and a slip, as the engine drafts one
  await sql`update activity set thinking = 'Counting is touching each block once', thinking_doc = ${sql.json({ idea: "Counting is touching each block once", slips: SLIPS })} where tenant_id = ${t} and code = ${MACHINE}`;
  await mark(sql, t, MACHINE, "thinking", "drafted");
  await mark(sql, t, PERSON, "steps", "person");
  for (const [lo, title, source] of [[LO_MACHINE, "U94 counts blocks to ten", "machine"], [LO_SHEET, "U94 sorts by size", "school"]] as const)
    await sql`insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source) values (${t}, ${lo}, 'K2', 'Numeracy', 'U94', ${title}, 'Foundational', ${source})
      on conflict (tenant_id, code) do update set title = excluded.title, source = excluded.source`;
  await sql`delete from activity_objective where tenant_id = ${t} and activity_code like 'ACT-K2-U94-%'`;
  await sql`delete from activity_skill where tenant_id = ${t} and activity_code like 'ACT-K2-U94-%'`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (${t}, ${MACHINE}, ${LO_MACHINE}, 1, 'machine'), (${t}, ${MACHINE}, ${LO_SHEET}, 2, 'school'), (${t}, ${SHEET}, ${LO_SHEET}, 1, 'school')`;
  await sql`insert into activity_skill (tenant_id, activity_code, skill_code, source) values (${t}, ${MACHINE}, ${skills[0].code}, 'machine'), (${t}, ${SHEET}, ${skills[1].code}, 'school')`;
  await sql`delete from learning_objective_skill where tenant_id = ${t} and lo_code like 'LO-U94-%'`;
  await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (${t}, ${LO_MACHINE}, ${skills[0].code}, 'machine'), (${t}, ${LO_SHEET}, ${skills[1].code}, 'school')`;
  return { tenant: t, skills };
}
