"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { engineSend } from "@/lib/engine";
import { isCoordinator, refusal } from "@/lib/timetable-ui";

// The lesson page's two writes (PR 3 after CP-35, CP-39, CP-40). Nothing is decided here: the engine says who may and why not, and its words
// come back to the page. A person is found by their sign-in (`requireStaff`, in the action itself); the engine is given their email as `actor`.
const UUID = /^[0-9a-f-]{36}$/;
export type Result = { error: string } | { done: string };

/** The coordinator chooses the lesson's activity (`/timetable/lesson/edit` with `activity_code`); past planning the engine asks a reason. */
export async function chooseActivity(sessionId: string, activity: string, reason: string): Promise<Result> {
  const me = await requireStaff();
  if (!UUID.test(sessionId)) return { error: "That is not a lesson." };
  if (!(await isCoordinator())) return { error: "Only the coordinator chooses a lesson's activity." };
  if (!activity) return { error: "Choose an activity." };
  const res = await engineSend("/timetable/lesson/edit", { actor: me.email, session_id: sessionId, activity_code: activity, reason: reason.trim() || null });
  if (!res.ok) return { error: await refusal(res, "That was not done.") };
  revalidatePath(`/period/${sessionId}`);
  revalidatePath("/timetable");
  return { done: "The activity is chosen." };
}

export type Filled = { level: number; rest: boolean; lists: Record<string, string[]> };

/** Save the lesson's marks as a form (`/voice/form`, with the lesson, whose activity and day it is about). */
export async function saveLessonForm(sessionId: string, classId: string, day: string, f: Filled): Promise<Result> {
  const me = await requireStaff();
  if (!UUID.test(sessionId) || !UUID.test(classId)) return { error: "That is not a lesson." };
  if (!Number.isInteger(f.level) || f.level < 0 || f.level > 3) return { error: "Choose the expected level." };
  const res = await engineSend("/voice/form", { actor: me.email, class_id: classId, session_id: sessionId, day, activity: "", level: f.level, lists: f.lists, rest: f.rest });
  if (res.status === 404) return { error: "This lesson is not this class's." };
  if (res.status === 409) {
    const words = await refusal(res, "That was not saved.");
    return { error: /activity/i.test(words) ? "Choose an activity first." : words };
  }
  if (!res.ok) return { error: await refusal(res, "That was not saved.") };
  revalidatePath(`/period/${sessionId}`);
  const marked = Object.values(f.lists).reduce((n, l) => n + l.length, 0);
  return { done: marked ? `Saved: ${marked} marked${f.rest ? ", the rest as expected" : ""}.` : f.rest ? "Saved: everyone as expected." : "Saved." };
}

/** The coordinator changes the lesson's words (`/timetable/lesson/edit` with `text`); past planning the engine asks a reason. */
export async function editLesson(sessionId: string, text: string, reason: string): Promise<Result> {
  const me = await requireStaff();
  if (!UUID.test(sessionId)) return { error: "That is not a lesson." };
  if (!(await isCoordinator())) return { error: "Only the coordinator edits a lesson." };
  if (!text.trim()) return { error: "Say what the lesson is." };
  const res = await engineSend("/timetable/lesson/edit", { actor: me.email, session_id: sessionId, text: text.trim(), reason: reason.trim() || null });
  if (!res.ok) return { error: await refusal(res, "That was not done.") };
  revalidatePath(`/period/${sessionId}`);
  revalidatePath("/timetable");
  return { done: "The lesson is changed." };
}
