"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { anyLessonOf, lessonAt, offersOf, type Asked, type Dated, type Offers, type Place } from "@/lib/lesson-picker";
import { isCoordinator, refusal } from "@/lib/timetable-ui";

// CP-74: the picker's reads and writes, for the lesson panel beside the timetable and the panel beside the Build grid. Nothing is decided
// here: the engine says who may choose (the coordinators, and the educator who holds the class) and refuses in its own words, which come
// back to the panel. A person is found by their sign-in (`requireStaff`, in each action); the engine is given their email as `actor`.
const UUID = /^[0-9a-f-]{36}$/i;
const NOT_A_LESSON = { ok: false as const, why: "That is not a lesson." };

/** The offers again, for another objective's activities (`lo`) or after a choice. */
export async function pickerRead(sessionId: string, lo?: string | null): Promise<Asked<Offers>> {
  const me = await requireStaff();
  if (!UUID.test(sessionId)) return NOT_A_LESSON;
  return offersOf(me.email, sessionId, lo);
}

/** One lesson's objective and activity (`/timetable/lesson/edit`). `lo` empty clears the objective; `activity` undefined leaves the
 *  lesson's activity as it is, empty clears it. What comes back is the lesson as it now stands. */
export async function pickerChoose(sessionId: string, lo: string, activity: string | undefined, reason: string): Promise<Asked<Offers>> {
  const me = await requireStaff();
  if (!UUID.test(sessionId)) return NOT_A_LESSON;
  try {
    const res = await engineSend("/timetable/lesson/edit", { actor: me.email, session_id: sessionId, lo_code: lo, activity_code: activity ?? null, reason: reason.trim() || null });
    if (!res.ok) return { ok: false, why: await refusal(res, "That was not saved.") };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
  revalidatePath(`/period/${sessionId}`);
  revalidatePath("/timetable");
  return offersOf(me.email, sessionId);
}

export type Planned = { written: number; lessons: { id: string; on_date: string; starts: string; title: string | null }[]; left_over: { code: string; title: string | null }[]; skipped: { id: string; on_date: string; holiday: boolean }[] };

/** Several lessons at once (`/timetable/lessons/fill`): the same as last week for this lesson, or a unit spread over the subject's lessons
 *  of this fortnight. `dry`: nothing is written; what comes back is what would be. */
export async function pickerFill(sessionId: string, mode: "same_as_last_week" | "spread", unit: string | null, dry: boolean, reason: string): Promise<Asked<Planned>> {
  const me = await requireStaff();
  if (!UUID.test(sessionId)) return NOT_A_LESSON;
  try {
    const res = await engineSend("/timetable/lessons/fill", { actor: me.email, session_id: sessionId, mode, unit, dry, reason: reason.trim() || null });
    if (!res.ok) return { ok: false, why: await refusal(res, "That was not saved.") };
    if (!dry) revalidatePath("/timetable");
    return { ok: true, data: (await res.json()) as Planned };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

export type AtPlace = { lesson: Dated; offers: Asked<Offers> } | { lesson: null; next: Asked<Offers> | null };

/** A place in the Build grid: its next published lesson with the lesson's offers, or, while no fortnight ahead is published, what is next
 *  up for the class in that subject (read through any lesson the subject has had; none when it has had none). */
export async function pickerAt(place: Place): Promise<AtPlace> {
  const me = await requireStaff();
  if (!UUID.test(place.classId) || !UUID.test(place.periodId) || !["A", "B"].includes(place.week) || !(place.weekday >= 1 && place.weekday <= 5)) return { lesson: null, next: null };
  const lesson = await lessonAt(place);
  if (lesson) return { lesson, offers: await offersOf(me.email, lesson.id) };
  const any = place.subject ? await anyLessonOf(place.classId, place.subject) : null;
  return { lesson: null, next: any ? await offersOf(me.email, any) : null };
}

/** After publishing: the suggestion job (`/timetable/lessons/suggest`), which gives the next objectives, machine-made, to lessons nobody
 *  chose for, only in subjects whose order a coordinator has checked. A person's lesson is never written; a second run writes nothing. */
export async function suggestObjectives(): Promise<Asked<{ written: number }>> {
  await requireStaff();
  if (!(await isCoordinator())) return { ok: false, why: "Only a coordinator asks for suggestions for the whole school." };
  try {
    const res = await engineSend("/timetable/lessons/suggest", null);
    if (!res.ok) return { ok: false, why: await refusal(res, "The suggestions were not made.") };
    revalidatePath("/timetable");
    return { ok: true, data: (await res.json()) as { written: number } };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}
