import { sql } from "./db";
import { mondayOf } from "./educator/clock";
import { staffNames } from "./timetable-ui";

// Delayed lessons (CP-59): the lessons of a class and week that went by without being taught, the free places of a coming week they can
// go to, and the week's ledger (what moved, what changed, what was not taught). Reads only; the move is the engine's (`/timetable/delayed`),
// which decides every refusal. Nothing is counted or compared here but whole lessons.

export type Late = { id: string; day: string; label: string; starts_at: string; what: string; subject: string | null };
export type Place = { day: string; ord: number; label: string; starts_at: string };
export type Moved = { id: string; lesson: string; from: string; to: string; who: string; why: string | null; at: string };
export type Changed = { id: string; lesson: string; was: string; now: string; who: string; why: string | null; at: string };

const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The week's lessons that were planned, are past and were not taught (their state is still `planned`): not fixed, not on a holiday. */
export async function notTaught(classId: string, week: string, today: string): Promise<Late[]> {
  const start = mondayOf(week);
  return sql<Late[]>`
    select s.id::text as id, d.on_date::text as day, p.label, to_char(p.starts_at, 'HH24:MI') as starts_at,
      coalesce(a.name, nullif(s.text, ''), p.label) as what, coalesce(su.label, su.name) as subject
    from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id
    left join subject su on su.tenant_id = s.tenant_id and su.code = s.subject_code
    left join activity a on a.tenant_id = s.tenant_id and a.code = s.activity_code
    where s.school_class_id = ${classId} and s.kind <> 'fixed' and s.state = 'planned' and s.planned and d.kind <> 'holiday'
      and d.on_date between ${start}::date and ${plus(start, 6)}::date and d.on_date < ${today}::date
    order by d.on_date, p.starts_at`;
}

/** Whether the class has any lesson placed in that week (a fortnight not yet made has none, and so no free place to name). */
export async function weekPlaced(classId: string, week: string): Promise<boolean> {
  const start = mondayOf(week);
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${classId} and d.on_date between ${start}::date and ${plus(start, 6)}::date`;
  return r.n > 0;
}

/** The free places of the week, from today on: a lesson period of the class's grade, on a school day that is not a holiday, where the
 *  class holds no lesson. */
export async function freePlaces(classId: string, week: string, today: string): Promise<Place[]> {
  const start = mondayOf(week);
  return sql<Place[]>`
    select d.on_date::text as day, p.ord, p.label, to_char(p.starts_at, 'HH24:MI') as starts_at
    from school_class c
    join school_day d on d.campus_id = c.campus_id and d.kind <> 'holiday' and d.on_date between ${start}::date and ${plus(start, 6)}::date and d.on_date >= ${today}::date
    join period p on p.tenant_id = c.tenant_id and p.grade_code = c.grade_code and not p.fixed
    where c.id = ${classId}
      and not exists (select 1 from session s where s.school_class_id = c.id and s.school_day_id = d.id and s.period_id = p.id)
    order by d.on_date, p.starts_at`;
}

/** The week's ledger: each move that left or reached a day of the week, and each edit of a lesson of the week. */
export async function ledger(classId: string, week: string): Promise<{ moved: Moved[]; changed: Changed[] }> {
  const start = mondayOf(week);
  const end = plus(start, 6);
  const names = await staffNames();
  const moves = await sql<{ id: string; before: Record<string, string>; after: Record<string, string>; staff_id: string | null; reason: string | null; at: string; kind: string | null; label: string | null; from_label: string | null; to_label: string | null }[]>`
    select c.id, c.before, c.after, c.staff_id, c.reason, c.at::text as at, c.after ->> 'subject_code' as kind,
      null::text as label, pf.label as from_label, pt.label as to_label
    from change_log c
    left join period pf on pf.id::text = c.before ->> 'period_id'
    left join period pt on pt.id::text = c.after ->> 'period_id'
    where c.table_name = 'session' and c.op = 'move' and c.before ->> 'school_class_id' = ${classId}
      and ((c.before ->> 'on_date') between ${start} and ${end} or (c.after ->> 'on_date') between ${start} and ${end})
    order by c.at desc, c.id`;
  const edits = await sql<{ id: string; before: Record<string, string>; after: Record<string, string>; staff_id: string | null; reason: string | null; at: string; what: string }[]>`
    select c.id, c.before, c.after, c.staff_id, c.reason, c.at::text as at, coalesce(nullif(s.text, ''), p.label) as what
    from change_log c join session s on s.id::text = c.row_id join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id
    where c.table_name = 'session' and c.op = 'edit' and s.school_class_id = ${classId} and d.on_date between ${start}::date and ${end}::date
    order by c.at desc, c.id`;
  const who = (id: string | null) => (id && names.get(id)) || "staff";
  return {
    moved: moves.map((r) => ({
      id: r.id,
      lesson: r.kind ?? "A lesson",
      from: `${r.before.on_date} ${r.from_label ?? ""}`.trim(),
      to: `${r.after.on_date} ${r.to_label ?? ""}`.trim(),
      who: who(r.staff_id),
      why: r.reason,
      at: r.at,
    })),
    changed: edits.map((r) => ({
      id: r.id,
      lesson: r.what,
      was: [r.before.text, r.before.subject_code, r.before.activity_code].filter(Boolean).join(" · ") || "nothing",
      now: [r.after.text, r.after.subject_code, r.after.activity_code].filter(Boolean).join(" · ") || "nothing",
      who: who(r.staff_id),
      why: r.reason,
      at: r.at,
    })),
  };
}
