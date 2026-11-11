// What Today reads (UI-7), every figure from the engine's own routes, the person's email as `actor`: the engine finds their
// classes and refuses what is not theirs. A refusal is an answer (the screen says so in words), never a crash.
import { cache } from "react";
import { EngineDown, engineSend } from "./engine";
import type { Day } from "./educator/types";
import type { Session } from "./auth";
import { sql } from "./db";
import { reachOf } from "./reach";

/** Which version of Today a person gets: the one for everything, or the one for their own classes. Decided by what the person's
 *  group reaches (`reachOf`, the database's one rule), never by naming a role. */
export const schoolVersion = async (me: Session): Promise<boolean> => (await reachOf(me)).classes === null;

/** How many hours a note may wait before it is late: the school's setting (voice.confirm_within_hours, 48). */
export const lateAfterHours = cache(async (): Promise<number> => {
  const [r] = await sql<{ v: number | null }[]>`select (value #>> '{}')::int as v from config where key = 'voice.confirm_within_hours'`;
  return r?.v ?? 48;
});

export type TodoRow = { note_id: string; activity: string | null; activity_name: string | null; received_at: string; age_hours: number; state: string };
export type Todo = { groups: Record<"to_confirm" | "fix_this" | "left_unconfirmed" | "being_read", { count: number; rows: TodoRow[] }> };
export type CoordinatorRow = TodoRow & { class: string };

async function ask<T>(path: "/k2/todo" | "/k2/coordinator" | "/timetable/day", body: Record<string, unknown>): Promise<{ ok: true; value: T } | { ok: false; status: number }> {
  try {
    const res = await engineSend(path, body as never);
    return res.ok ? { ok: true, value: (await res.json()) as T } : { ok: false, status: res.status };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, status: 503 };
    throw e;
  }
}

/** Her notes in groups, oldest first (/k2/todo). Null when the engine does not give them (switched off, not on the staff list). */
export const myNotes = async (me: Pick<Session, "email">) => {
  const got = await ask<Todo>("/k2/todo", { actor: me.email });
  return got.ok ? got.value : null;
};

/** Her day for her first class (/timetable/day). Null when there is none to show (switched off, no class held). */
export const myDay = async (me: Pick<Session, "email">, day?: string) => {
  const got = await ask<Day>("/timetable/day", { actor: me.email, day: day ?? null });
  return got.ok ? got.value : null;
};

/** The campus's notes that need a decision, red first (/k2/coordinator). Null when it is not the person's to read. */
export const schoolNotes = async (me: Pick<Session, "email">) => {
  const got = await ask<{ rows: CoordinatorRow[]; counts: Record<string, number> }>("/k2/coordinator", { actor: me.email });
  return got.ok ? got.value : null;
};

/** The id of each lesson (a session) of a class on a day, by its period: the engine's day names the period, and the page for one lesson is the session's. */
export async function sessionsOf(classId: string, day: string): Promise<Record<string, string>> {
  const rows = await sql<{ id: string; period_id: string }[]>`
    select s.id::text, s.period_id::text from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${classId} and d.on_date = ${day}`;
  return Object.fromEntries(rows.map((r) => [r.period_id, r.id]));
}

/** The two figures of the strip that are notes, from her groups: left unconfirmed (do now), and still waiting within their time (this week). The page and the badge both use these. */
export const noteFigures = (t: Todo | null) => ({
  late: t?.groups.left_unconfirmed.count ?? 0,
  soon: t ? t.groups.to_confirm.count + t.groups.fix_this.count + t.groups.being_read.count : 0,
});

/** The one count on the site, the badge on the bar's Today door: the strip's do-now plus this-week (the two never overlap), computed once per request.
 *  An educator's are her notes; the school's are the notes left unconfirmed across the classes (the rest of the school's figures join it with their rows). */
export const todayBadge = cache(async (me: Session): Promise<number> => {
  if (await schoolVersion(me)) {
    const got = await schoolNotes(me);
    return got ? got.rows.filter((r) => r.state === "left_unconfirmed").length : 0;
  }
  const f = noteFigures(await myNotes(me));
  return f.late + f.soon;
});
