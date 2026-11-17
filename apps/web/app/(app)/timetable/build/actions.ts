"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import type { Asked, Pattern } from "@/lib/timetable-build";
import { checkOf, type Check } from "@/lib/timetable-check";
import { refusal, type Rules } from "@/lib/timetable-rules";

// The Build page's writes. One form, one engine call; the person's email is the `actor`. Nothing is decided here: the engine says who may
// write (the coordinators) and refuses in its own words, which come back on the page.

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** Start a class that has no day from another class's day shape and fixed rows. */
export async function startFrom(form: FormData): Promise<void> {
  const me = await requireStaff();
  const classId = text(form, "class_id");
  const from = text(form, "from_class");
  const back = (q: string) => redirect(`/timetable/build?${q}`);
  if (!classId || !from) return back(`error=${encodeURIComponent("Choose the class whose day to start from.")}`);
  let res: Response;
  try {
    res = await engineSend("/timetable/pattern/copy", { actor: me.email, class_id: classId, mode: "start_from", from_class: from });
  } catch (e) {
    if (e instanceof EngineDown) return back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  if (!res.ok) return back(`error=${encodeURIComponent(await refusal(res, "That was not started."))}`);
  return redirect(`/timetable/build?class=${encodeURIComponent(classId)}`);
}

// The painting door: each call is one engine call carrying the stamp of the pattern the person was looking at, so a change made on an
// older one is refused in the engine's words. What comes back is the new pattern and the inverse, which is what Undo applies.
export type Edit = Record<string, unknown>;
export type Outcome = { ok: true; pattern: Pattern; inverse: Edit[]; skipped: number } | { ok: false; why: string };

async function go(me: { email: string }, path: "/timetable/pattern/change" | "/timetable/pattern/fill" | "/timetable/pattern/copy", body: Record<string, unknown>): Promise<Outcome> {
  try {
    const res = await engineSend(path, { actor: me.email, ...body } as never);
    if (!res.ok) return { ok: false, why: await refusal(res, "That was not saved.") };
    const done = (await res.json()) as { pattern: Pattern; inverse: Edit[]; skipped?: unknown[] };
    return { ok: true, pattern: done.pattern, inverse: done.inverse, skipped: done.skipped?.length ?? 0 };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

/** `version`: the stamp of the pattern on the page. None for a class the page is not showing (a fix that moves another class's lesson):
 *  its stamp is read first, so the change is made on that class's pattern as it stands. */
export async function changePattern(classId: string, version: string | null, edits: Edit[], from?: string | null): Promise<Outcome> {
  const me = await requireStaff();
  let stamp = version;
  if (stamp === null) {
    try {
      const res = await engineSend("/timetable/pattern/read", { actor: me.email, class_id: classId, from_date: from ?? null });
      if (!res.ok) return { ok: false, why: await refusal(res, "That class could not be read.") };
      stamp = ((await res.json()) as Pattern).version;
    } catch (e) {
      if (e instanceof EngineDown) return { ok: false, why: e.message };
      throw e;
    }
  }
  return go(me, "/timetable/pattern/change", { class_id: classId, version: stamp, edits, from_date: from ?? null });
}

export async function fillPeriod(classId: string, version: string, periodId: string, what: { cell: string; subject_code: string; text: string }, from?: string | null): Promise<Outcome> {
  const me = await requireStaff();
  return go(me, "/timetable/pattern/fill", { class_id: classId, version, period_id: periodId, ...what, from_date: from ?? null });
}

export async function copyWeek(classId: string, version: string, from?: string | null): Promise<Outcome> {
  const me = await requireStaff();
  return go(me, "/timetable/pattern/copy", { class_id: classId, version, mode: "week", from_week: "A", to_week: "B", from_date: from ?? null });
}

/** Every class's pattern checked again: the page asks after each change. */
export async function checkPattern(from?: string | null): Promise<Asked<Check>> {
  const me = await requireStaff();
  return checkOf(me.email, from);
}

/** A Must problem stands this once, with the coordinator's reason (the engine keeps it as an approval). */
export async function allowProblem(allowKey: string, reason: string, from?: string | null): Promise<{ ok: true } | { ok: false; why: string }> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/timetable/pattern/allow", { actor: me.email, class_ids: [], allow_key: allowKey, reason, from_date: from ?? null });
    return res.ok ? { ok: true } : { ok: false, why: await refusal(res, "That was not allowed.") };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

/** One rule set or removed through the rules door; what comes back is the class's rules as they now are. */
export type RuleBody = {
  rule: "limit" | "away";
  action: "set" | "remove";
  id?: string;
  subject_code?: string;
  span?: "day" | "week" | "fortnight";
  fewest?: number | null;
  most?: number | null;
  level?: "must" | "try";
  staff_id?: string;
  weekday?: number;
  week_code?: "A" | "B" | null;
  period_id?: string | null;
  reason?: string;
};
export async function saveRule(classId: string, body: RuleBody): Promise<{ ok: true; rules: Rules } | { ok: false; why: string }> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/timetable/rules/change", { actor: me.email, class_id: classId, ...body });
    if (!res.ok) return { ok: false, why: await refusal(res, "That rule was not saved.") };
    return { ok: true, rules: (await res.json()) as Rules };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

/** The class's pattern written as the fortnight's lessons. `dry`: nothing is written; what comes back is what would be. A refusal is the
 *  engine's sentence (a Must problem still open, lessons already there, a school day not on the calendar). */
export type Published = { ok: true; written: number; holidays: string[] } | { ok: false; why: string };
export async function publishPattern(classId: string, fortnight: number, dry: boolean): Promise<Published> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/timetable/publish", { actor: me.email, class_id: classId, fortnight, dry });
    if (!res.ok) return { ok: false, why: await refusal(res, "That was not published.") };
    const done = (await res.json()) as { written: number; holidays: string[] };
    return { ok: true, written: done.written, holidays: done.holidays };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

// Fill it in for me (CP-75). The engine works out an answer and shows it: nothing is written until the coordinator uses it, and using it is
// one change with its inverse, like any other on this page. Ten seconds on screen; the school's own ceiling is the engine's.
const FILL_SECONDS = 10;
export type FillAnswer = {
  outcome: "placed" | "unmeetable" | "not_found_in_time" | "failed";
  run_ids: string[];
  sentence?: string;
  notes: string[];
  rules: { sentence: string }[];
  problems: { sentence: string }[];
  classes: { class_id: string; needed: number; placed: number; edits: Edit[]; set: number; cleared: number }[];
};
export async function fillIn(classId: string, from?: string | null): Promise<{ ok: true; answer: FillAnswer } | { ok: false; why: string }> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/timetable/solve", { actor: me.email, class_ids: [classId], from_date: from ?? null, seconds: FILL_SECONDS });
    if (!res.ok) return { ok: false, why: await refusal(res, "That could not be worked out.") };
    return { ok: true, answer: (await res.json()) as FillAnswer };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

/** The answer written to the pattern, all or none. What comes back is the pattern as it now is and the one inverse that undoes it. */
export async function acceptFill(classId: string, runIds: string[], from?: string | null): Promise<Outcome> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/timetable/solve/use", { actor: me.email, run_ids: runIds });
    if (!res.ok) return { ok: false, why: await refusal(res, "That was not saved.") };
    const done = (await res.json()) as { classes: { class_id: string; inverse: Edit[] }[] };
    const now = await engineSend("/timetable/pattern/read", { actor: me.email, class_id: classId, from_date: from ?? null });
    if (!now.ok) return { ok: false, why: await refusal(now, "It was saved, but the pattern could not be read. Reload the page.") };
    return { ok: true, pattern: (await now.json()) as Pattern, inverse: done.classes.find((c) => c.class_id === classId)?.inverse ?? [], skipped: 0 };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}
