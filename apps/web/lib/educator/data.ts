import { notFound } from "next/navigation";
import type { Session } from "../auth";
import { type BodyOf, EngineDown, type PostPath, engineSend } from "../engine";
import type { MarkKey } from "../voice-words";
import type { ActivityPage, CatalogueItem, Day, LessonActivity, LessonOffers, MaterialsList, OnePeriod, SchoolList, WaitingNote, Week } from "./types";

// What the K2 educator's screens read, all from the engine with her email as `actor` (M1-09): the engine finds her staff
// id and her classes. Behind `educator.timetable_enabled` (config, off): the engine refuses while it is off, and every
// page is then not found.
async function read<T, P extends PostPath = PostPath>(path: P, body: BodyOf<P>): Promise<T> {
  const res = await engineSend(path, body);
  if (res.status === 404 || res.status === 403) notFound(); // switched off, a class she does not hold, a day not on record
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as T;
}

/** The same read, but a refusal (switched off, a class she does not hold, nothing live) is `null` instead of a 404, for the Timetable: a door of
 *  the menu must never lead to "not found" (live, 11 Nov 2026). The page then says in words why there is nothing to show (issue #691). */
async function readOrNull<T, P extends PostPath = PostPath>(path: P, body: BodyOf<P>): Promise<T | null> {
  const res = await engineSend(path, body);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as T;
}

/** Her day (M1-06's /timetable/day: her first class unless she picked one, today unless she picked a day), or null when the engine has no day to give (a holiday or a day not on record, a class she does not hold, switched off): for
 *  Materials, a door of the menu, which then says why in words instead of "not found" (issue #691). */
export const dayOrNull = (me: Pick<Session, "email">, q: { class_id?: string; day?: string }) => readOrNull<Day, "/timetable/day">("/timetable/day", { actor: me.email, ...q });

export const weekOrNull = (me: Pick<Session, "email">, q: { class_id?: string; week_of?: string }) => readOrNull<Week, "/timetable/week">("/timetable/week", { actor: me.email, ...q });

/** Her week, Monday to Saturday (M1-06's /timetable/week). */
export const weekOf = (me: Pick<Session, "email">, q: { class_id?: string; week_of?: string }) => read<Week, "/timetable/week">("/timetable/week", { actor: me.email, ...q });

/** One period of one day, with the planner's lines for its subject this fortnight (M1-06's /timetable/period). */
export const periodOf = (me: Pick<Session, "email">, q: { class_id?: string; day: string; period_id: string }) =>
  read<OnePeriod, "/timetable/period">("/timetable/period", { actor: me.email, ...q });

/** Whether her screens are open to her (the switch on, or the staff preview): a screen that reads no timetable asks
 * first, so it is not found exactly when the timetable is not. */
export const openTo = (me: Pick<Session, "email">) => read<{ previewing: boolean }, "/timetable/open">("/timetable/open", { actor: me.email });

export type Span = "day" | "week" | "fortnight";
const DAYS: Record<Span, number> = { day: 0, week: 6, fortnight: 13 };
const until = (from: string, days: number) => new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Her class's list from `from` for a day, a week or a fortnight (M1-10's /materials/build: the list for that range,
 * refreshed from the plan, never a second one), each day its own group. The staff preview is answered the list worked
 * out and not kept (D-076), so its answer is used as it comes, never read back by id. Null when the list is not hers, or the
 * engine has no such class on record (the page says why in words, never "not found"). */
export async function materialsOf(me: Pick<Session, "email">, class_id: string, from: string, span: Span): Promise<MaterialsList | null> {
  const res = await engineSend("/materials/build", { actor: me.email, class_id, period: span, from, to: until(from, DAYS[span]), group_by: "day" });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as MaterialsList;
}

/** The catalogue she adds from: a line is always a catalogue item, never free text (D-071). */
export const catalogueOf = async (me: Pick<Session, "email">) =>
  (await read<{ items: CatalogueItem[] }, "/materials/catalogue/list">("/materials/catalogue/list", { actor: me.email })).items;

/** The school's list for a month (M1-16's /materials/school/build), for the coordinator, and for the staff preview
 * worked out and not kept; null when the person may not see it, and the page says so. */
export async function schoolListOf(me: Pick<Session, "email">, from: string, to: string): Promise<SchoolList | null> {
  const res = await engineSend("/materials/school/build", { actor: me.email, from, to });
  if (res.status === 403) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as SchoolList;
}

/** The notes waiting for a person, oldest first (M1-16's /materials/review/list); null when not hers to read. */
export async function waitingNotes(me: Pick<Session, "email">): Promise<WaitingNote[] | null> {
  const res = await engineSend("/materials/review/list", { actor: me.email });
  if (res.status === 403) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return ((await res.json()) as { notes: WaitingNote[] }).notes;
}

/** An activity's page, part by part (M1-12b's /curriculum/page/read). */
export const pageOf = (me: Pick<Session, "email">, code: string) => read<ActivityPage, "/curriculum/page/read">("/curriculum/page/read", { actor: me.email, code });

/** A lesson's activity in full, for the lesson page; null when the engine will not say (switched off, not her class). */
export const lessonActivity = (me: Pick<Session, "email">, q: { class_id: string; day: string; period_id: string }) => readOrNull<LessonActivity, "/timetable/activity">("/timetable/activity", { actor: me.email, ...q });

/** The activities a lesson may hold; null for anyone the engine does not let choose (the coordinator group's only). */
export const lessonOffers = (me: Pick<Session, "email">, sessionId: string) => readOrNull<LessonOffers, "/timetable/lesson/offers">("/timetable/lesson/offers", { actor: me.email, session_id: sessionId });

/** The roll numbers enrolled in a class on a day (POST /voice/class), for the form's squares; empty when the voice screens are off. */
export async function classRolls(me: Pick<Session, "email">, classId: string, day: string): Promise<string[]> {
  const res = await engineSend("/voice/class", { actor: me.email, class_id: classId, day });
  if (!res.ok) return [];
  return ((await res.json()) as { rolls: string[] }).rolls;
}

/** What one child showed in a lesson against its activity's rubric (CP-49), as the engine takes it: a level of the four (0 the lowest), or a
 *  status. Keyed by the child's id; no name goes to the engine or comes back. */
type Status = Extract<MarkKey, "absent" | "not_willing">;
export type ChildMark = { child_id: string; level: number } | { child_id: string; status: Status };
/** A child's mark as the engine reads it back: one of `level` and `status` is set. */
export type MarkRead = { child_id: string; level: number | null; status: Status | null; confirmation_id: string; by: "you" | "another"; marked_at: string; by_default?: boolean };
export type LevelsSaved = { confirmation_id: string; written: number; evidence_written: number; activity_has_no_skills: boolean; by_default?: number };

// CP-49 v1, as the engine serves it (lib/engine-routes.ts):
//   save: { actor, class_id, session_id, day?, marks: ChildMark[], rest_level? } → LevelsSaved; 403 not allowed, 404 lesson not in the class,
//         409 the lesson has no activity, 422 a child not enrolled or a level not one of the four. `rest_level` marks every enrolled child with
//         no mark yet; a child already marked keeps theirs.
//   read: { actor, class_id, session_id } → LevelRead. Neither is gated on the voice switch; a coordinator may mark.

/** The last earlier lesson of this class on this activity that has marks: how many children were at each level, and absent or not willing. */
export type LevelHistory = { session_id: string; day: string; counts: Record<"0" | "1" | "2" | "3" | "absent" | "not_willing", number> };
/** A lesson's levels as the engine reads them (CP-49 v1): the children enrolled in the class on the lesson's day (the same set the save
 *  accepts, by Sr. No.), their marks today, and the last time. No names: the page adds the ones the person may see. */
export type LevelRead = { activity_code: string | null; roll: { child_id: string; sr_no: number }[]; marks: MarkRead[]; last: LevelHistory | null };

export async function lessonLevels(me: Pick<Session, "email">, q: { class_id: string; session_id: string }): Promise<LevelRead> {
  const res = await engineSend("/lesson/level/read", { actor: me.email, ...q });
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as LevelRead;
}

/** Save marks for children of a lesson in one call, and with `rest_level` every child not yet marked: the engine decides who may, and says why not. */
export const saveLevels = (me: Pick<Session, "email">, q: { class_id: string; session_id: string; day?: string; marks: readonly ChildMark[]; rest_level?: number }) =>
  engineSend("/lesson/level", { actor: me.email, ...q, marks: [...q.marks] });
