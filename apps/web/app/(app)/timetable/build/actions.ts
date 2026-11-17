"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { checkOf, type Check, type Pattern } from "@/lib/timetable-build";
import { refusal } from "@/lib/timetable-rules";

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

async function go(path: "/timetable/pattern/change" | "/timetable/pattern/fill" | "/timetable/pattern/copy", body: Record<string, unknown>): Promise<Outcome> {
  const me = await requireStaff();
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

export async function changePattern(classId: string, version: string | null, edits: Edit[], from?: string | null): Promise<Outcome> {
  return go("/timetable/pattern/change", { class_id: classId, version, edits, from_date: from ?? null });
}

export async function fillPeriod(classId: string, version: string, periodId: string, what: { cell: string; subject_code: string; text: string }, from?: string | null): Promise<Outcome> {
  return go("/timetable/pattern/fill", { class_id: classId, version, period_id: periodId, ...what, from_date: from ?? null });
}

export async function copyWeek(classId: string, version: string, from?: string | null): Promise<Outcome> {
  return go("/timetable/pattern/copy", { class_id: classId, version, mode: "week", from_week: "A", to_week: "B", from_date: from ?? null });
}

/** The problems of a class as the pattern stands now (after every change the panel asks again). */
export async function checkClass(classId: string): Promise<Check | null> {
  const me = await requireStaff();
  const c = await checkOf(me.email, classId);
  return c.ok ? c.data : null;
}

/** A Must problem allowed with a reason, as the engine's accepting group may; its sentence comes back on a refusal. */
export async function allowProblem(classId: string, allowKey: string, reason: string): Promise<{ ok: true } | { ok: false; why: string }> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/timetable/pattern/allow", { actor: me.email, class_ids: [], allow_key: allowKey, reason });
    return res.ok ? { ok: true } : { ok: false, why: await refusal(res, "That was not allowed.") };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}
