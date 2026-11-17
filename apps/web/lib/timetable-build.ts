import { EngineDown, engineSend } from "./engine";
import { refusal } from "./timetable-rules";

// The Build page's reads (CP-71, /timetable/build). Nothing is decided here: what a class card says, where a lesson sits and every
// refusal are the engine's (routes/timetable_build.py, timetable_pattern.py); this asks and says what came back, in its own words.

export type CardState = "todo" | "waiting" | "fix" | "done";
export type HomeCard = {
  class_id: string;
  name: string;
  grade: string;
  has_day: boolean;
  placed: number;
  total: number;
  next_fortnight: { number: number; starts_on: string; ends_on: string } | null;
  changes_from_published: number;
  problems: { must: number; try: number };
  state: CardState;
};
export type BuildHome = { year: string | null; classes: HomeCard[]; can_publish: boolean; blocked_by: string | null };

export type PatternPeriod = { id: string; ord: number; label: string; starts_at: string; ends_at: string | null; fixed: boolean };
export type CellKind = "empty" | "fixed" | "subject" | "specialist";
export type PatternCell = { period_id: string; week: "A" | "B"; weekday: number; cell: CellKind; subject_code: string | null; text: string; source: "machine" | "person" | null };
export type Pattern = {
  class: { id: string; grade: string; section: string };
  as_of: string;
  version: string;
  periods: PatternPeriod[];
  cells: PatternCell[];
};

export type Asked<T> = { ok: true; data: T } | { ok: false; why: string };

async function ask<T>(go: () => Promise<Response>, fallback: string): Promise<Asked<T>> {
  try {
    const res = await go();
    if (!res.ok) return { ok: false, why: await refusal(res, fallback) };
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

/** Every class of the year with its card's facts, and whether the next fortnight can be published. */
export const buildHome = (email: string) => ask<BuildHome>(() => engineSend("/timetable/build/home", { actor: email }), "The engine could not read the classes.");

/** A class's pattern as of a date (the first fortnight not yet published, when none is given). */
export const patternOf = (email: string, classId: string, from?: string) =>
  ask<Pattern>(() => engineSend("/timetable/pattern/read", { actor: email, class_id: classId, from_date: from ?? null }), "The engine could not read that pattern.");

/** "7 Dec" from "2026-12-07". */
export const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Fortnight 12, 7 to 18 Dec". */
export function fortnightWords(f: NonNullable<HomeCard["next_fortnight"]>): string {
  const end = new Date(`${f.ends_on}T00:00:00Z`);
  const a = new Date(`${f.starts_on}T00:00:00Z`);
  const same = a.getUTCMonth() === end.getUTCMonth();
  return `Fortnight ${f.number}, ${same ? a.getUTCDate() : shortDay(f.starts_on)} to ${shortDay(f.ends_on)}`;
}

/** The one line under a card's name, in the school's words. */
export function cardLine(c: HomeCard): string {
  if (!c.has_day) return "Not started: no day shape yet.";
  const parts = [`${c.placed} of ${c.total} lessons placed`];
  if (c.problems.must) parts.push(`${c.problems.must} to fix before publishing`);
  else if (c.problems.try) parts.push(`${c.problems.try} to look at`);
  return parts.join(", ") + ".";
}

/** The start and end of a day shape: "08:30 to 15:10", from the periods in time order. */
export function dayWords(periods: PatternPeriod[]): string {
  if (!periods.length) return "";
  const last = periods[periods.length - 1];
  return `${periods[0].starts_at} to ${last.ends_at ?? last.starts_at}`;
}

// The checker's answer (engine `tt_check_load.check`): each problem is a sentence with the places it touches and the fixes the checker has already
// proven (each fix is the list of edits `pattern/change` takes).
export type Fix = { class_id: string; sentence: string; edits: Record<string, unknown>[] };
export type Place = { class_id: string; class: string; period_id: string; week: "A" | "B"; weekday: number; subject_code: string | null };
export type Problem = { kind: string; level: "must" | "try"; key: string; allow_key: string; sentence: string; places: Place[]; allowed: boolean; fixes: Fix[] };
export type Check = { problems: Problem[]; blocking: string[]; notes: string[]; counts: { must: number; try: number } };

/** The problems that touch a class (an educator clash touches two), from the check of every pattern. */
export function aboutClass(all: Check, classId: string): Check {
  const problems = all.problems.filter((p) => p.places.some((x) => x.class_id === classId));
  const keys = new Set(problems.map((p) => p.key));
  return {
    problems,
    blocking: all.blocking.filter((k) => keys.has(k)),
    notes: all.notes,
    counts: { must: problems.filter((p) => p.level === "must").length, try: problems.filter((p) => p.level === "try").length },
  };
}

/** The check of every class that has a pattern (an educator clash needs both classes), narrowed to one class. */
export async function checkOf(email: string, classId: string): Promise<Asked<Check>> {
  const all = await ask<Check>(() => engineSend("/timetable/pattern/check", { actor: email, class_ids: [] }), "The engine could not check the pattern.");
  return all.ok ? { ok: true, data: aboutClass(all.data, classId) } : all;
}
