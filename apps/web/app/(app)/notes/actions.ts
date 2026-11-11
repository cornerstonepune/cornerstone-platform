"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { classNotes, typedNote } from "@/lib/notes-loop";
import { myVoice, refusal, voiceOn } from "@/lib/voice";
import { W } from "@/lib/voice-words";
import type { Sent } from "../voice/board";

// The notes loop's writes (UI-3a), each the engine's with her email as `actor`; the engine checks the note is hers. Every action
// asks who is asking first (requireStaff, tests/test_web_gate.py) and that voice notes are switched on.
async function switchedOn() {
  if (!(await voiceOn())) redirect("/today");
}

/** Confirm this note and only this note; then the next note waiting in the class, or Notes. */
export async function confirmHere(noteId: string, classId: string, s: Sent): Promise<{ error: string } | void> {
  const me = await requireStaff();
  await switchedOn();
  let res: Response;
  try {
    res = await engineSend("/voice/notes/confirm", { actor: me.email, note_id: noteId, ...s });
  } catch (e) {
    if (e instanceof EngineDown) return { error: W.confirm.notSaved };
    throw e;
  }
  if (!res.ok) return { error: await refusal(res, W.confirm.notSaved) };
  const next = (await classNotes(me, classId))?.notes.find((n) => n.note_id !== noteId && (n.state === "to_confirm" || n.state === "fix_this"));
  redirect(next ? `/notes/${next.note_id}` : "/notes");
}

/** "Type the marks": the empty note for a class (and a lesson, when one is chosen), opened on the confirm screen. */
export async function startTyped(classId: string, sessionId?: string): Promise<{ error: string } | void> {
  const me = await requireStaff();
  await switchedOn();
  if (!(await myVoice(me))?.classes.some((c) => c.id === classId)) return { error: "That class is not yours." };
  const got = await typedNote(me, classId, sessionId);
  if ("error" in got) return got;
  redirect(`/notes/${got.id}`);
}

/** Correct one child's mark on a confirmed note: a new row that replaces the first, with the reason. */
export async function correctMark(formData: FormData): Promise<{ error: string } | void> {
  const me = await requireStaff();
  await switchedOn();
  const body = { actor: me.email, observation_id: String(formData.get("observation") ?? ""), outcome: String(formData.get("outcome") ?? "") as "above", reason: String(formData.get("reason") ?? "").trim() };
  if (!body.reason) return { error: "Say why, in a few words." };
  let res: Response;
  try {
    res = await engineSend("/voice/observations/correct", body);
  } catch (e) {
    if (e instanceof EngineDown) return { error: W.confirm.notSaved };
    throw e;
  }
  if (!res.ok) return { error: await refusal(res, W.confirm.notSaved) };
  redirect(String(formData.get("back") ?? "/notes"));
}
