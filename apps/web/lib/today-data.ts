// What Today reads (UI-7), every figure from the engine's own routes, the person's email as `actor`: the engine finds their
// classes and refuses what is not theirs. A refusal is an answer (the screen says so in words), never a crash.
import { cache } from "react";
import { EngineDown, engineSend } from "./engine";
import type { Day } from "./educator/types";
import type { Session } from "./auth";
import { actingAsEducator } from "./acting-view";
import { sql } from "./db";
import { reachOf } from "./reach";
import { tiles as schoolTiles, type School } from "./today-school";

/** Which version of Today a person gets: the one for everything, or the one for their own classes. Decided by what the person's
 *  group reaches (`reachOf`, the database's one rule), never by naming a role. A coordinator acting as an educator (the bar's switch)
 *  gets the educator's, as an educator would: a view, never a permission. The page and the bar's count both ask this, so they agree. */
export const schoolVersion = cache(async (me: Session): Promise<boolean> => (await reachOf(me)).classes === null && !(await actingAsEducator(me)));

/** How many hours a note may wait before it is late: the school's setting (voice.confirm_within_hours, 48). */
export const lateAfterHours = cache(async (): Promise<number> => {
  const [r] = await sql<{ v: number | null }[]>`select (value #>> '{}')::int as v from config where key = 'voice.confirm_within_hours'`;
  return r?.v ?? 48;
});

export type TodoRow = { note_id: string; activity: string | null; activity_name: string | null; received_at: string; age_hours: number; state: string };
export type Todo = { groups: Record<"to_confirm" | "fix_this" | "left_unconfirmed" | "being_read", { count: number; rows: TodoRow[] }> };
export type CoordinatorRow = TodoRow & { class: string };

/** One read for Today: the engine's answer, or why there is none in words a person can read. `down`: the engine could not be reached
 *  or was too slow, so nothing is known and nothing is counted. Otherwise it refused, and its own words say why (switched off, no
 *  class held, not on the staff list). Either way the page says it and still renders. */
export type Read<T> = { ok: true; value: T } | { ok: false; down: boolean; words: string };

/** How long Today waits for the engine: under the frame's database deadline (PAGE_WAIT_MS, 8 s), so a slow engine is a sentence on
 *  the page, never the error page. */
export const TODAY_WAIT_MS = 5_000;

async function refusal(res: Response): Promise<string> {
  try {
    const detail = ((await res.json()) as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // an answer with no words of its own: said below
  }
  return `The engine did not give this (${res.status}).`;
}

async function ask<T>(path: "/k2/todo" | "/k2/coordinator" | "/k2/today-school" | "/timetable/day", body: Record<string, unknown>): Promise<Read<T>> {
  try {
    const res = await engineSend(path, body as never, TODAY_WAIT_MS);
    return res.ok ? { ok: true, value: (await res.json()) as T } : { ok: false, down: false, words: await refusal(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, down: true, words: e.message };
    throw e;
  }
}

// Each read is asked once per request (React's `cache`): the page and the bar's count read the same answer, so they cannot disagree.
const notesOf = cache((email: string) => ask<Todo>("/k2/todo", { actor: email }));
const dayOf = cache((email: string, day: string | null) => ask<Day>("/timetable/day", { actor: email, day }));
const coordinatorOf = cache((email: string) => ask<{ rows: CoordinatorRow[]; counts: Record<string, number> }>("/k2/coordinator", { actor: email }));
const countsOf = cache((email: string) => ask<School>("/k2/today-school", { actor: email }));

/** Her notes in groups, oldest first (/k2/todo). */
export const myNotes = (me: Pick<Session, "email">) => notesOf(me.email);

/** Her day for her first class (/timetable/day). */
export const myDay = (me: Pick<Session, "email">, day?: string) => dayOf(me.email, day ?? null);

/** The campus's notes that need a decision, red first (/k2/coordinator). */
export const schoolNotes = (me: Pick<Session, "email">) => coordinatorOf(me.email);

/** The school's counts (CP-28's /k2/today-school): clashes, drafts, late notes, materials, last week, next week, readiness. When the engine
 *  does not give them (the route is not deployed, or the person is not a coordinator) the screen shows what it can read elsewhere. */
export const schoolCounts = (me: Pick<Session, "email">) => countsOf(me.email);

/** The id of each lesson (a session) of a class on a day, by its period: the engine's day names the period, and the page for one lesson is the session's. */
export async function sessionsOf(classId: string, day: string): Promise<Record<string, string>> {
  const rows = await sql<{ id: string; period_id: string }[]>`
    select s.id::text, s.period_id::text from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${classId} and d.on_date = ${day}`;
  return Object.fromEntries(rows.map((r) => [r.period_id, r.id]));
}

/** The id of each class by grade and section as the engine's counts name them: a cell of last week's grid opens that class's day. */
export async function classIds(): Promise<Record<string, string>> {
  const rows = await sql<{ id: string; grade: string; section: string | null }[]>`select id::text, grade_code as grade, section from school_class`;
  return Object.fromEntries(rows.map((r) => [`${r.grade}|${r.section ?? ""}`, r.id]));
}

export type Happening = { day: string; what: string };
/** What is different about the days from `from` for seven days: a day that is not a teaching day (a holiday, changed timing) with its note, and a fortnight that begins. */
export async function nextWeekEvents(from: string): Promise<Happening[]> {
  const [days, fortnights] = await Promise.all([
    sql<{ day: string; kind: string; note: string | null }[]>`
      select distinct on_date::text as day, kind, note from school_day
      where on_date between ${from}::date and ${from}::date + 6 and kind <> 'teaching' order by day`,
    sql<{ day: string; number: number | null }[]>`
      select starts_on::text as day, number from fortnight where starts_on between ${from}::date and ${from}::date + 6 and kind = 'teaching'`,
  ]);
  return [
    ...days.map((d) => ({ day: d.day, what: d.kind === "holiday" ? `Holiday${d.note ? `: ${d.note}` : ""}` : d.kind === "changed_timing" ? `Changed timing${d.note ? `: ${d.note}` : ""}` : `No school day on record${d.note ? `: ${d.note}` : ""}` })),
    ...fortnights.map((f) => ({ day: f.day, what: f.number ? `Fortnight ${f.number} begins` : "A fortnight begins" })),
  ].sort((a, b) => a.day.localeCompare(b.day));
}

/** The two figures of the strip that are notes, from her groups: left unconfirmed (do now), and still waiting within their time (this
 *  week). The page and the badge both use these. A refusal (notes switched off, not on the staff list) is an answer: she has no notes
 *  waiting. Null when the engine could not be read: nothing is counted then, rather than a 0 that may not be true. */
export function noteFigures(t: Read<Todo>): { late: number; soon: number } | null {
  if (t.ok) return { late: t.value.groups.left_unconfirmed.count, soon: t.value.groups.to_confirm.count + t.value.groups.fix_this.count + t.value.groups.being_read.count };
  return t.down ? null : { late: 0, soon: 0 };
}

/** The one count on the site, the badge on the bar's Today door: the strip's do-now plus this-week (the two never overlap), computed once
 *  per request. An educator's are her notes; the school's are its strip's two tiles (clashes, late notes, drafts, materials lines). No
 *  badge (0) when the engine could not be read: the page then says so in words instead of counting. */
export const todayBadge = cache(async (me: Session): Promise<number> => {
  if (await schoolVersion(me)) {
    const counts = await schoolCounts(me);
    if (counts.ok) {
      const t = schoolTiles(counts.value);
      return t.doNow + t.soon;
    }
    const got = await schoolNotes(me);
    return got.ok ? got.value.rows.filter((r) => r.state === "left_unconfirmed").length : 0;
  }
  const f = noteFigures(await myNotes(me));
  return f ? f.late + f.soon : 0;
});
