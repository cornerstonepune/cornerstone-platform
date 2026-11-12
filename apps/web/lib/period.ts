import { sql } from "./db";
import { seesClass } from "./reach";

// One period of one class on one day, as the Period screen (UI-3a) reads it: the session, its plan entry's activity, and what
// the class last showed on that activity (the outcomes of the last day it was observed). The class is checked by the page against
// the person's own classes before any of this is shown.
export type SessionRow = {
  id: string;
  class_id: string;
  section: string;
  grade: string;
  day: string;
  period_id: string;
  starts_at: string;
  ends_at: string;
  subject: string | null;
  kind: string;
  text: string;
  activity: { code: string; name: string } | null;
};

export async function sessionOf(id: string): Promise<SessionRow | null> {
  const [r] = await sql<(Omit<SessionRow, "activity"> & { code: string | null; aname: string | null })[]>`
    select s.id, s.school_class_id as class_id, sc.label as section, sc.grade_code as grade, p.id::text as period_id, d.on_date::text as day, to_char(p.starts_at, 'HH24:MI') as starts_at, to_char(p.ends_at, 'HH24:MI') as ends_at,
           coalesce(su.label, su.name) as subject, s.kind, s.text, a.code, a.name as aname
    from session s
    join school_class sc on sc.id = s.school_class_id
    join school_day d on d.id = s.school_day_id
    join period p on p.id = s.period_id
    left join subject su on su.tenant_id = s.tenant_id and su.code = s.subject_code
    left join plan_entry pe on pe.id = s.plan_entry_id
    left join activity a on a.id = coalesce((select x.id from activity x where x.tenant_id = s.tenant_id and x.code = s.activity_code), pe.activity_id)
    where s.id = ${id}`;
  if (!r) return null;
  const { code, aname, ...rest } = r;
  return { ...rest, activity: code && aname ? { code, name: aname } : null };
}

export type LastTime = { day: string; counts: Record<string, number>; named: { outcome: string; children: string[] }[] } | null;

/** The class's last day on this activity: how many children had each outcome that day (a mark replaced by a correction is not
 *  counted twice), and who was below or not willing. */
export async function lastTime(classId: string, activity: string, before: string): Promise<LastTime> {
  const rows = await sql<{ day: string; outcome: string; child_id: string }[]>`
    select (o.observed_at at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date::text as day, o.outcome, o.child_id
    from activity_observation o
    where o.class_id = ${classId} and o.activity_code = ${activity} and (o.observed_at at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date < ${before}::date
      and not exists (select 1 from activity_observation s where s.supersedes = o.id)
    order by o.observed_at desc`;
  if (!rows.length) return null;
  const day = rows[0].day;
  const of = rows.filter((r) => r.day === day);
  const counts: Record<string, number> = {};
  for (const r of of) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  const named = ["below", "not_willing"].map((outcome) => ({ outcome, children: of.filter((r) => r.outcome === outcome).map((r) => r.child_id) }));
  return { day, counts, named };
}

export type DaySession = { id: string; starts_at: string; name: string };

/** The class's lessons with an activity on a day, by time: the periods a note can be about. A fixed part of the day has no activity
 *  to record, so it is not offered. */
export async function sessionsOfDay(classId: string, day: string): Promise<DaySession[]> {
  return sql<DaySession[]>`
    select s.id, to_char(p.starts_at, 'HH24:MI') as starts_at, coalesce(a.name, nullif(s.text, ''), p.label) as name
    from session s
    join school_day d on d.id = s.school_day_id
    join period p on p.id = s.period_id
    left join plan_entry pe on pe.id = s.plan_entry_id
    left join activity a on a.id = coalesce((select x.id from activity x where x.tenant_id = s.tenant_id and x.code = s.activity_code), pe.activity_id)
    where s.school_class_id = ${classId} and d.on_date = ${day}::date and s.kind <> 'fixed'
    order by p.starts_at`;
}

/** How many of the class's children have been seen on this activity (a mark replaced by a correction counts once), and how many are on the roll. */
export async function seenOn(classId: string, activity: string): Promise<{ seen: number; total: number }> {
  const [r] = await sql<{ seen: number; total: number }[]>`
    select (select count(distinct o.child_id)::int from activity_observation o
            where o.class_id = ${classId} and o.activity_code = ${activity} and not exists (select 1 from activity_observation s where s.supersedes = o.id)) as seen,
           (select count(*)::int from child_now where class_id = ${classId} and active) as total`;
  return r;
}

/** The session of a class on a day in a period, when there is one (an empty slot, a lesson moved away, has none). */
export async function sessionAt(classId: string, day: string, periodId: string): Promise<string | null> {
  const [r] = await sql<{ id: string }[]>`
    select s.id::text as id from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${classId} and d.on_date = ${day}::date and s.period_id = ${periodId}`;
  return r?.id ?? null;
}

/** A period as the school names it, and the class's own words, for the page of a slot with no lesson in it; null when either is not found. */
export async function slotOf(classId: string, periodId: string): Promise<{ section: string; grade: string; starts_at: string; label: string } | null> {
  const [r] = await sql<{ section: string; grade: string; starts_at: string; label: string }[]>`
    select c.label as section, c.grade_code as grade, to_char(p.starts_at, 'HH24:MI') as starts_at, p.label
    from school_class c, period p where c.id = ${classId} and p.id = ${periodId}`;
  return r ?? null;
}

/** Whether the person may see what is of this class (the same rule as every other screen: `staff_sees`). */
export async function mayRead(me: Parameters<typeof seesClass>[0], section: string): Promise<boolean> {
  const [r] = await sql<{ ok: boolean }[]>`select ${seesClass(me, sql`${section}`)} as ok`;
  return !!r?.ok;
}
