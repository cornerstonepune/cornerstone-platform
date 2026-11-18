import { ask, type Asked } from "./timetable-build";
import { engineSend } from "./engine";

// The pattern's problems as the engine finds them (CP-71, /timetable/pattern/check). Every sentence, every level and every fix is the
// engine's (tt_check, tt_check_fix: a fix is offered only after the checker has run on the pattern as it would be). Nothing is judged here.

export type Level = "must" | "try";
export type ProblemKind = "educator" | "away" | "most_in_day" | "most_in_week" | "most_in_fortnight";
export type Place = { class_id: string; class: string; period_id: string; week: "A" | "B"; weekday: number; subject_code: string | null };
export type Fix = { class_id: string; sentence: string; edits: Record<string, unknown>[] };
export type Problem = { kind: ProblemKind; level: Level; key: string; allow_key: string; sentence: string; places: Place[]; allowed: boolean; fixes: Fix[] };
export type Check = { as_of: string; problems: Problem[]; blocking: string[]; notes: string[]; notes_of: Record<string, string[]>; counts: { must: number; try: number } };

/** Every class's pattern checked together, so an educator down for two classes at once is seen from either. */
export const checkOf = (email: string, from?: string | null): Promise<Asked<Check>> =>
  ask<Check>(() => engineSend("/timetable/pattern/check", { actor: email, class_ids: [], from_date: from ?? null }), "The engine could not check the timetable.");

/** The problems that touch this class, the ones that stop publishing first (the engine's order). */
export const problemsOf = (check: Check, classId: string): Problem[] => check.problems.filter((p) => p.places.some((x) => x.class_id === classId));

/** How many of a class's problems still need someone: a Must nobody allowed, and every Try to. */
export function open(problems: Problem[]): { must: number; try: number } {
  return { must: problems.filter((p) => p.level === "must" && !p.allowed).length, try: problems.filter((p) => p.level === "try").length };
}

/** The rule behind a problem, in the school's words (design E1). The two that are always on say so. */
export const RULE: Record<ProblemKind, string> = {
  educator: "An educator teaches one class at a time. Always on.",
  away: "An educator is not given a lesson while away.",
  most_in_day: "The most of a subject in a day.",
  most_in_week: "The most of a subject in a week.",
  most_in_fortnight: "The most of a subject in a fortnight.",
};
