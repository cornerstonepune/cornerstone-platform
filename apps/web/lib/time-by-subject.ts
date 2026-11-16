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
  done_lessons: number;
  done_minutes: number;
  share_pct: number;
  target_share_pct: number | null;
  status: "within" | "over" | "short" | "no_standing_time";
};
export type TimeBySubject = {
  start: string;
  end: string;
  total_minutes: number;
  done_minutes: number;
  subjects: SubjectTime[];
  weeks: { week_start: string; subjects: { subject_code: string; minutes: number }[] }[];
  read: ClassRef[];
  may_read: ClassRef[];
};

/** The periods the page offers, each a stretch of the calendar the school's timetable is read over. */
export const PERIODS = [
  { key: "week", label: "This week", icon: "week" },
  { key: "month", label: "This month", icon: "time" },
  { key: "quarter", label: "This quarter", icon: "history" },
  { key: "term", label: "This term", icon: "fortnight" },
] as const;
export type Term = { label: string; starts_on: string; ends_on: string };
export type Period = { key: string; label: string; start: string; end: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const valid = (v: string | undefined): v is string => !!v && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** The school's terms, from the config row `school.terms` ([{label, starts_on, ends_on}]); none when the school has not said (never invented). */
export async function termsOf(): Promise<Term[]> {
  const [r] = await sql<{ value: unknown }[]>`select value from config where key = 'school.terms'`;
  return Array.isArray(r?.value) ? (r.value as Term[]).filter((t) => valid(t?.starts_on) && valid(t?.ends_on) && t.ends_on >= t.starts_on) : [];
}

/** The days a period covers, whole: this week Monday to Sunday, this month and this quarter by the calendar, this term the school's term
 *  that holds today (else the next to start, else the last). Two dates in the address (`from`, `to`) are a custom period, at most 400 days
 *  (the engine's limit); a term asked for when the school has named none is the week. Planned lessons still ahead in the period count as
 *  planned and, being not yet done, as no taught time. */
export function periodOf(q: { range?: string; from?: string; to?: string }, today: string, terms: readonly Term[]): Period {
  if (valid(q.from) && valid(q.to) && q.to >= q.from && (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 400)
    return { key: "custom", label: "Chosen dates", start: q.from, end: q.to };
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1];
  if (q.range === "month") return { key: "month", label: "This month", start: day(y, m, 1), end: day(y, m + 1, 0) };
  if (q.range === "quarter") {
    const first = m - (m % 3);
    return { key: "quarter", label: "This quarter", start: day(y, first, 1), end: day(y, first + 3, 0) };
  }
  if (q.range === "term" && terms.length) {
    const t = terms.find((x) => x.starts_on <= today && today <= x.ends_on) ?? terms.find((x) => x.starts_on > today) ?? terms[terms.length - 1];
    return { key: "term", label: t.label, start: t.starts_on, end: t.ends_on };
  }
  return { key: "week", label: "This week", start: mondayOf(today), end: plus(mondayOf(today), 6) };
}

/** Minutes as a person says them: "45 min", "2 h", "2 h 5 min". */
export const hoursOf = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

/** What the class chooser holds: "everyone" (every class, a coordinator's), "all:<grade>" for every class of a grade (a coordinator's), or a class id. */
export type Chosen = { class_id: string } | { grade: string } | { everyone: true };
export function parseChoice(v: string | undefined): Chosen | null {
  if (!v) return null;
  if (v === "everyone") return { everyone: true };
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

export type LessonLine = { id: string; day: string; starts_at: string; class_id: string; text: string; activity: string | null; done: boolean };

/** The lessons behind one subject's row: the classes the engine read, in the period; the lessons the engine counted (no fixed lesson, no
 *  holiday), in time order, each with whether it was taught (its state is done). */
export async function lessonsOf(classIds: readonly string[], subject: string, range: { start: string; end: string }): Promise<LessonLine[]> {
  if (!classIds.length) return [];
  return sql<LessonLine[]>`
    select s.id::text as id, d.on_date::text as day, to_char(p.starts_at, 'HH24:MI') as starts_at, s.school_class_id::text as class_id,
      s.text, a.name as activity, s.state = 'done' as done
    from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id
    left join activity a on a.tenant_id = s.tenant_id and a.code = s.activity_code
    where s.school_class_id = any(${classIds as string[]}::uuid[]) and s.subject_code = ${subject} and s.kind <> 'fixed'
      and d.kind <> 'holiday' and d.on_date between ${range.start}::date and ${range.end}::date
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
