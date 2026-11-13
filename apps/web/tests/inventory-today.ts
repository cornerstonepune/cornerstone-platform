// What the two Todays (page charter B1, B1b) need in the inventory run, built from the test's own rows. Kept apart from inventory-fixtures.ts,
// which registers them; `aside` and the fixture class are handed in so the two files do not import each other.
import type { Sql } from "postgres";

type Aside = <T>(f: (sql: Sql) => Promise<T>) => Promise<T>;

/** A school day far from every other spec's, on which the fixture class has one lesson with an activity. */
export const LESSON_DAY = "2031-03-12";
let wasOn = false;

/** The timetable switched on for the run of today-educator, the inventory educator holding the fixture class, and one lesson on LESSON_DAY: the
 *  day the educator's Today opens with a lesson in its panel (`@today-lesson`). Put away by `todayGone`, which puts the switch back and ends
 *  the grant made here (ended, never deleted). */
export const todayRest = (aside: Aside, SECTION: string, EDUCATOR: { email: string }) =>
  aside(async (sql) => {
    const [{ tenant, klass, campus, grade }] = await sql<{ tenant: string; klass: string; campus: string; grade: string }[]>`
      select tenant_id::text as tenant, id::text as klass, campus_id::text as campus, grade_code as grade from school_class where label = ${SECTION} order by created_at limit 1`;
    const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled' limit 1), false) as on`;
    wasOn = r.on;
    await sql`insert into config (tenant_id, key, value, description) select id, 'educator.timetable_enabled', 'true'::jsonb, 'u70 today fixture' from tenant
      on conflict (tenant_id, key) do update set value = excluded.value`;
    const [who] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${EDUCATOR.email}`;
    await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
      select ${tenant}, ${who.staff}, 'class_teacher', ${klass}, current_date - 1, 'u70 today fixture'
      where not exists (select 1 from staff_role_grant where staff_id = ${who.staff} and school_class_id = ${klass} and role_code in ('class_teacher', 'cover_educator') and (valid_to is null or valid_to >= current_date))`;
    const [{ day }] = await sql<{ day: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${LESSON_DAY}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id::text as day`;
    // a period the grade already has (a new one would be a period of every class of the grade, and other specs count them)
    const [{ period }] = await sql<{ period: string }[]>`select id::text as period from period where grade_code = ${grade} and not fixed order by starts_at limit 1`;
    await sql`insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${klass}, ${day}, ${period}, 'math', 'subject', 'planned', true, 'Inventory lesson', 'ACT-U70-1')
      on conflict (school_class_id, school_day_id, period_id) do update set activity_code = excluded.activity_code`;
  });

export const todayGone = (aside: Aside) =>
  aside(async (sql) => {
    await sql`update config set value = ${wasOn ? sql`'true'::jsonb` : sql`'false'::jsonb`} where key = 'educator.timetable_enabled'`;
    // the class held only for this screen's run: what the educator reaches elsewhere is as it was
    await sql`update staff_role_grant set valid_to = valid_from where granted_by = 'u70 today fixture' and valid_to is null`;
  });
