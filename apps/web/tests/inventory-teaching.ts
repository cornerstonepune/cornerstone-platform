// What the teaching screens (activity, objective, skill) need to show something in the inventory run, built from the test's own
// rows (UI-3c): an activity with its four levels and a part the machine made, an objective it builds toward, two skills linked to both, a
// confirmed link between the skills, and children of the fixture class seen on them. Made once; observations are append-only.
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Sql } from "postgres";

export const TEACHING = { activity: "ACT-U70-3C", objective: "LO-U70-3C" } as const;
export type Teaching = { activity: string; objective: string; skill: string; skillSet: string };

/** Two links between registry skills, made by the engine's own fixture (no web code names the raw link tables): `after` follows
 *  `before` by a confirmed link, `proposed` follows `before` by a link nobody has confirmed. Placeholder rows; a second run changes nothing. */
export function linkFixture(before: string, after: string, proposed: string) {
  const engine = path.resolve(__dirname, "../../../packages/engine");
  execFileSync(path.join(engine, ".venv/bin/python"), ["tests/k2_link_fixture.py", before, after, proposed], { cwd: engine, env: process.env, stdio: "pipe" });
}

export async function seedTeaching(sql: Sql, classId: string, educatorEmail: string): Promise<Teaching> {
  const [{ tenant }] = await sql<{ tenant: string }[]>`select id as tenant from tenant order by created_at limit 1`;
  const skills = await sql<{ code: string }[]>`select code from registry_skill where tenant_id = ${tenant} order by code limit 3`;
  const { activity, objective } = TEACHING;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, level_0, level_1, level_2, level_3, steps, steps_list, thinking, materials)
    values (${tenant}, ${activity}, 'K2', 'Maths', 'Sorting by size', '', 'Sorts things by how big they are.', 'Sorts two things.', 'Sorts three things.', 'Sorts five things.', 'Says why.', 'Lay out. Sort.', ${sql.json(["Lay out the things.", "Sort them."])}, 'A draft about size.', 'Ten blocks')
    on conflict (tenant_id, code) do nothing`;
  await sql`insert into learning_objective (tenant_id, code, band, subject, unit, title, signal) values (${tenant}, ${objective}, 'K2', 'Numeracy', 'Sorting', 'Sorts by size', 'Foundational') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (${tenant}, ${activity}, ${objective}, 1) on conflict do nothing`;
  for (const s of skills.slice(0, 2)) {
    await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code) values (${tenant}, ${objective}, ${s.code}) on conflict do nothing`;
    await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, ${activity}, ${s.code}) on conflict do nothing`;
  }
  linkFixture(skills[0].code, skills[1].code, skills[2].code);
  // the thinking part is the machine's (CP-48): it carries the machine symbol, and the Edit in place exists only for such a part
  const [marked] = await sql`select 1 from activity_part_source where activity_code = ${activity} and source = 'drafted'`;
  if (!marked)
    await sql`insert into change_log (tenant_id, table_name, row_id, op, after, origin, reason)
      values (${tenant}, 'activity', ${activity}, 'part_source', ${sql.json({ part: "thinking", source: "drafted", proposal_id: null, staff_id: null, check_me: true })}, 'u70 fixture', 'u70 fixture')`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${classId} and activity_code = ${activity}`;
  if (n === 0) {
    const [{ staff }] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${educatorEmail}`;
    await sql`update school_class set grade_code = 'K2' where id = ${classId}`;
    for (const [roll, level, daysAgo] of [["1", 3, 20], ["1", 3, 9], ["2", 2, 3], ["3", 1, 3]] as const) {
      const [c] = await sql<{ id: string }[]>`select id from child_now where class_id = ${classId} and roll_no = ${roll}`;
      const at = new Date(Date.now() - daysAgo * 86_400_000);
      const [o] = await sql<{ id: string }[]>`
        insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
        values (${tenant}, gen_random_uuid(), ${activity}, ${c.id}, ${classId}, 'as_expected', 'individual', 'form', 2, ${level}, ${at}, ${staff}, ${staff}) returning id`;
      for (const k of skills.slice(0, 2))
        await sql`insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark, seen_by, place, source, observation_id)
          values (${tenant}, ${c.id}, ${k.code}, 'educator', ${at}, ${staff}, 'observed', ${level === 3 ? "yes" : level === 2 ? "sometimes" : "not_yet"}, ${staff}, 'class', 'u70 fixture', ${o.id})`;
      await sql`select rebuild_child_observed_state(${c.id})`;
    }
  }
  // the skill set screen's [code] is a skill SET's (grades 1 to 4), one the seed holds
  const [set] = await sql<{ code: string }[]>`select code from skill where tenant_id = ${tenant} order by (code = 'ADD.2D2D') desc, code limit 1`;
  return { activity, objective, skill: skills[1].code, skillSet: set.code };
}
