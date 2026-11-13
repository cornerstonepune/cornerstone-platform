import type { Session } from "./auth";
import { sql } from "./db";
import { EngineDown, engineSend } from "./engine";
import { mondayOf } from "./educator/clock";

// Time by subject (docs/frontend/page-charter.md B3): how much teaching time a class gives each subject, and whether it matches the
// timetable rules. The numbers are the engine's (CP-41's /timetable/time, with its weeks and the frame's share): nothing here adds a
// minute up or decides within, over or short. A range is whole weeks ending with the school's today, so its last week runs to today.

export type ClassRef = { id: string; grade: string; section: string };
export type SubjectTime = {
  subject: string;
  label: string;
  lessons: number;
  minutes: number;
  share_pct: number;
  target_share_pct: number | null;
  status: "within" | "over" | "short" | "no_standing_time";
};
export type TimeBySubject = {
  start: string;
  end: string;
  total_minutes: number;
  subjects: SubjectTime[];
  weeks: { week_start: string; subjects: { subject_code: string; minutes: number }[] }[];
  read: ClassRef[];
  may_read: ClassRef[];
};

/** The four ranges the page offers, each a count of weeks. */
export const RANGES = [
  { key: "week", label: "Week", weeks: 1, icon: "week" },
  { key: "fortnight", label: "Fortnight", weeks: 2, icon: "fortnight" },
  { key: "month", label: "Month", weeks: 4, icon: "time" },
  { key: "quarter", label: "Quarter", weeks: 13, icon: "history" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];
export const rangeOf = (key: string | undefined) => RANGES.find((r) => r.key === key) ?? RANGES[1];

/** The dates of a range: from the Monday `weeks - 1` weeks before today's week, to today. */
export const datesOf = (weeks: number, today: string) => ({ start: mondayOf(today, 1 - weeks), end: today });

/** What the class chooser holds: "all:<grade>" for every class of a grade (a coordinator's), or a class id. */
export type Chosen = { class_id: string } | { grade: string };
export function parseChoice(v: string | undefined): Chosen | null {
  if (!v) return null;
  const all = /^all:([\w-]{1,20})$/.exec(v);
  if (all) return { grade: all[1] };
  return /^[0-9a-f-]{36}$/.test(v) ? { class_id: v } : null;
}

/** The engine's reading, or null when it refuses (her screens switched off, a class she does not hold, a grade asked by an educator). */
export async function timeBySubject(me: Pick<Session, "email">, chosen: Chosen, dates: { start: string; end: string }): Promise<TimeBySubject | null> {
  const res = await engineSend("/timetable/time", { actor: me.email, ...dates, ...chosen });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as TimeBySubject;
}

/** The grade a coordinator opens on: the first, in the school's order, with lessons in the range; none when no class has any. */
export async function firstGradeTaught(dates: { start: string; end: string }): Promise<string | null> {
  const [r] = await sql<{ grade: string }[]>`
    select c.grade_code as grade from school_class c join session s on s.school_class_id = c.id join school_day d on d.id = s.school_day_id
    left join grade g on g.tenant_id = c.tenant_id and g.code = c.grade_code
    where d.on_date between ${dates.start}::date and ${dates.end}::date
    group by c.grade_code, g.ord order by g.ord nulls last, c.grade_code limit 1`;
  return r?.grade ?? null;
}

export type LessonLine = { id: string; day: string; starts_at: string; class_id: string; text: string; activity: string | null };

/** The lessons behind one bar segment: the classes the engine read, one week (inside the range), one subject; the lessons the engine
 *  counted (no fixed lesson, no holiday), in time order. */
export async function lessonsOf(classIds: readonly string[], week: string, subject: string, range: { start: string; end: string }): Promise<LessonLine[]> {
  if (!classIds.length) return [];
  const from = week > range.start ? week : range.start;
  const sunday = new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const to = sunday < range.end ? sunday : range.end;
  return sql<LessonLine[]>`
    select s.id::text as id, d.on_date::text as day, to_char(p.starts_at, 'HH24:MI') as starts_at, s.school_class_id::text as class_id,
      s.text, a.name as activity
    from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id
    left join activity a on a.tenant_id = s.tenant_id and a.code = s.activity_code
    where s.school_class_id = any(${classIds as string[]}::uuid[]) and s.subject_code = ${subject} and s.kind <> 'fixed'
      and d.kind <> 'holiday' and d.on_date between ${from}::date and ${to}::date
    order by d.on_date, p.starts_at, s.school_class_id`;
}

/** The chip a subject's row carries (page charter B3): Within, Over or Short against the rules' time, none when the rules give it none.
 *  The same states the timetable's "against the rule" uses (components/status-chip.tsx). */
export function chipOf(status: SubjectTime["status"]): { state: "done" | "fixThis" | "waiting"; words: string } | null {
  if (status === "within") return { state: "done", words: "Within" };
  if (status === "over") return { state: "fixThis", words: "Over" };
  if (status === "short") return { state: "waiting", words: "Short" };
  return null;
}
