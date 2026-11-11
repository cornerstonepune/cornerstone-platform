// The rows the UI-6 specs stand on: a class "U74" of K2 with two fortnights of its own (7401 under way, 7402 ahead), three
// lessons a day, a move made by hand, a blocked Wednesday that clashes, a plan line and a kept draft. Made once; a second run
// finds them (the append-only tables are never cleaned, only found). Placeholder rows, local copy only.
import type { Sql } from "postgres";
import { k2Class } from "./k2-rows";

export const SECTION = "U74";
export const YEAR = "2041-42";
export const GRADE = "K1"; // its own grade and year, so the school's own K2 timetable load (m1-14a) never meets these rows
export const HERE = 7401;
export const AHEAD = 7402;
const P = [["U74 P1", "17:01", 91, "NUM"], ["U74 P2", "17:41", 92, "ENG"], ["U74 P3", "18:21", 93, "NUM"]] as const;

export type Fixture = { klass: string; staff: string; tenant: string; year: string; here: string; ahead: string; periods: { id: string; ord: number; subject: string }[]; days: string[]; block: string };

export async function timetableRows(sql: Sql): Promise<Fixture> {
  // found by its section once made: k2Class looks a class up by the school's K2 year, and this one lives in its own
  const [made] = await sql<{ klass: string; staff: string }[]>`
    select c.id as klass, ps.staff_id as staff from school_class c join academic_year y on y.id = c.academic_year_id, pii.staff ps
    where c.section = ${SECTION} and y.label = ${YEAR} and ps.email = 'e2e@cornerstone.test' limit 1`;
  const k = made ?? (await k2Class(sql, SECTION));
  const [{ tenant, campus }] = await sql<{ tenant: string; campus: string }[]>`
    select c.tenant_id as tenant, c.campus_id as campus from school_class c where c.id = ${k.klass}`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, ${YEAR}, '2026-01-01', '2032-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  await sql`update school_class set academic_year_id = ${year}, grade_code = ${GRADE} where id = ${k.klass}`;
  const [{ monday }] = await sql<{ monday: string }[]>`select (date_trunc('week', (now() at time zone 'Asia/Kolkata')::date))::date::text as monday`;
  const fortnight = async (number: number, offset: number, state: string) => {
    const [r] = await sql<{ id: string }[]>`
      insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state)
      values (${tenant}, ${year}, ${number}, 'teaching', ${monday}::date + ${offset}::int, ${monday}::date + ${offset + 11}::int, ${state})
      on conflict (tenant_id, academic_year_id, starts_on) do update set number = ${number}, kind = 'teaching', ends_on = excluded.ends_on, state = ${state} returning id`;
    return r.id;
  };
  const here = await fortnight(HERE, 0, "frozen");
  const ahead = await fortnight(AHEAD, 14, "aligned");
  const periods: Fixture["periods"] = [];
  for (const [label, at, ord, subject] of P) {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${at}::time, ${label}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
    periods.push({ id: p.id, ord, subject });
  }
  const days: string[] = [];
  for (let i = 0; i < 26; i++) {
    const [d] = await sql<{ on: string; dow: number }[]>`select (${monday}::date + ${i}::int)::text as on, extract(isodow from ${monday}::date + ${i}::int)::int as dow`;
    if (d.dow > 5) continue;
    days.push(d.on);
    const [day] = await sql<{ id: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${d.on}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
    for (const p of periods)
      await sql`
        insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
        values (${tenant}, ${k.klass}, ${day.id}, ${p.id}, ${p.subject}, 'subject', 'planned', true, ${`${p.subject} lesson`})
        on conflict (school_class_id, school_day_id, period_id) do nothing`;
  }
  // the frame (week A and B, every weekday, three lessons) and a block on every Wednesday: those lessons clash until accepted
  const [had] = await sql<{ n: number }[]>`select count(*)::int as n from timetable_rule where school_class_id = ${k.klass} and kind = 'frame'`;
  if (had.n === 0)
    for (const w of ["A", "B"]) for (let wd = 1; wd <= 5; wd++) for (const p of periods)
      await sql`
        insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
        values (${tenant}, ${k.klass}, 'frame', ${p.id}, ${w}, ${wd}, 'subject', ${p.subject}, ${`${p.subject} lesson`}, ${monday}::date - 30)`;
  let [block] = await sql<{ id: string }[]>`select id from timetable_rule where school_class_id = ${k.klass} and kind = 'block' limit 1`;
  block ??= (await sql<{ id: string }[]>`
    insert into timetable_rule (tenant_id, school_class_id, kind, weekday, reason) values (${tenant}, ${k.klass}, 'block', 3, 'U74 sports day') returning id`)[0];
  // a lesson moved by hand in fortnight 7401: Thursday's P1 into Friday's P1, kept with who and why
  const [mv] = await sql<{ n: number }[]>`select count(*)::int as n from change_log where table_name = 'session' and op = 'move' and row_id = ${`${k.klass} ${here}`}`;
  if (mv.n === 0) {
    const thu = days[3], fri = days[4];
    await sql`
      insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)
      values (${tenant}, 'session', ${`${k.klass} ${here}`}, 'move',
        ${sql.json({ school_class_id: k.klass, on_date: thu, period_id: periods[0].id })}, ${sql.json({ school_class_id: k.klass, on_date: fri, period_id: periods[0].id })},
        ${k.staff}, ${`staff:${k.staff}`}, 'The educator was away')`;
    await sql`update session set state = 'moved' where school_class_id = ${k.klass} and period_id = ${periods[0].id} and school_day_id = (select id from school_day where on_date = ${fri}::date and tenant_id = ${tenant} limit 1)`;
  }
  await sql`
    insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source)
    values (${tenant}, ${k.klass}, ${here}, 'U74-1', 1, 'Count the red cards', 'u74') on conflict do nothing`;
  const [run] = await sql<{ n: number }[]>`select count(*)::int as n from timetable_run where school_class_id = ${k.klass} and fortnight_id = ${ahead}`;
  if (run.n === 0) {
    const a = days.filter((d) => d >= days[10]);
    const draft = [0, 1].flatMap((i) => periods.slice(0, 2).map((p) => ({ date: a[i], week: "A", period_id: p.id, subject_code: p.subject })));
    await sql`
      insert into timetable_run (tenant_id, school_class_id, fortnight_id, outcome, needed, placed, input_text, output_text, fet_version, seed, solve_seconds, report, draft, created_by)
      values (${tenant}, ${k.klass}, ${ahead}, 'not_found_in_time', 6, ${draft.length}, 'u74', 'u74', 'u74', 1, 5,
        ${sql.json({ words: "no timetable found in 5 seconds", rules: [{ kind: "block", id: block.id, words: "U74 sports day (Wednesday)" }] })}, ${sql.json(draft)}, 'u74')`;
  }
  return { klass: k.klass, staff: k.staff, tenant, year, here, ahead, periods, days, block: block.id };
}
