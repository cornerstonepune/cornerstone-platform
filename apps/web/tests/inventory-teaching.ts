// What the teaching screens (activity, objective, skill) need to show something in the inventory run, built from the test's own
// rows (UI-3c): an activity with its four levels and a drafted part, an objective it builds toward, two skills linked to both, a
// confirmed link between the skills, and children of the fixture class seen on them. Made once; observations are append-only.
import type { Sql } from "postgres";

export const TEACHING = { activity: "ACT-U70-3C", objective: "LO-U70-3C" } as const;
export type Teaching = { activity: string; objective: string; skill: string };

export async function seedTeaching(sql: Sql, classId: string, educatorEmail: string): Promise<Teaching> {
  const [{ tenant }] = await sql<{ tenant: string }[]>`select id as tenant from tenant order by created_at limit 1`;
  const skills = await sql<{ code: string }[]>`select code from registry_skill where tenant_id = ${tenant} order by code limit 2`;
  const { activity, objective } = TEACHING;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, level_0, level_1, level_2, level_3, steps, steps_list, thinking, materials)
    values (${tenant}, ${activity}, 'K2', 'Maths', 'Sorting by size', '', 'Sorts things by how big they are.', 'Sorts two things.', 'Sorts three things.', 'Sorts five things.', 'Says why.', 'Lay out. Sort.', ${sql.json(["Lay out the things.", "Sort them."])}, 'A draft about size.', 'Ten blocks')
    on conflict (tenant_id, code) do nothing`;
  await sql`insert into learning_objective (tenant_id, code, band, subject, unit, title, signal) values (${tenant}, ${objective}, 'K2', 'Numeracy', 'Sorting', 'Sorts by size', 'Foundational') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (${tenant}, ${activity}, ${objective}, 1) on conflict do nothing`;
  for (const s of skills) {
    await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code) values (${tenant}, ${objective}, ${s.code}) on conflict do nothing`;
    await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, ${activity}, ${s.code}) on conflict do nothing`;
  }
  // a confirmed link names who confirmed it (the schema refuses one that does not)
  const [{ staff }] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${educatorEmail}`;
  await sql`insert into skill_prerequisite (tenant_id, registry_code, before_registry_code, reason, source, status, confirmed_by, confirmed_at)
    select ${tenant}, ${skills[1].code}, ${skills[0].code}, 'u70', 'u70 fixture', 'confirmed', ${staff}, now() where not exists (select 1 from skill_prerequisite where registry_code = ${skills[1].code} and before_registry_code = ${skills[0].code})`;
  // the thinking part is a draft waiting for a person: the coordinator's Keep, Edit and Send back exist only for one
  const [marked] = await sql`select 1 from activity_part_source where activity_code = ${activity} and source = 'drafted'`;
  if (!marked)
    await sql`insert into change_log (tenant_id, table_name, row_id, op, after, origin, reason)
      values (${tenant}, 'activity', ${activity}, 'part_source', ${sql.json({ part: "thinking", source: "drafted", proposal_id: null, staff_id: null, check_me: true })}, 'u70 fixture', 'u70 fixture')`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${classId} and activity_code = ${activity}`;
  if (n === 0) {
    await sql`update school_class set grade_code = 'K2' where id = ${classId}`;
    for (const [roll, level, daysAgo] of [["1", 3, 20], ["1", 3, 9], ["2", 2, 3], ["3", 1, 3]] as const) {
      const [c] = await sql<{ id: string }[]>`select id from child_now where class_id = ${classId} and roll_no = ${roll}`;
      const at = new Date(Date.now() - daysAgo * 86_400_000);
      const [o] = await sql<{ id: string }[]>`
        insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
        values (${tenant}, gen_random_uuid(), ${activity}, ${c.id}, ${classId}, 'as_expected', 'individual', 'form', 2, ${level}, ${at}, ${staff}, ${staff}) returning id`;
      for (const k of skills)
        await sql`insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark, seen_by, place, source, observation_id)
          values (${tenant}, ${c.id}, ${k.code}, 'educator', ${at}, ${staff}, 'observed', ${level === 3 ? "yes" : level === 2 ? "sometimes" : "not_yet"}, ${staff}, 'class', 'u70 fixture', ${o.id})`;
      await sql`select rebuild_child_observed_state(${c.id})`;
    }
  }
  return { activity, objective, skill: skills[1].code };
}
