// The shapes of the engine's K2 voice answers the website reads (routes/voice.py), with no database or engine call, so
// What needs doing's pure list (lib/todo.ts) can use them.
/** `gradeName`: the grade as the school says it ("Grade 2"; the grade table's name), added by the website (lib/voice.ts). */
export type VoiceClass = { id: string; grade: string; section: string; gradeName?: string };
export type QueuedNote = { id: string; class_id: string; status: string; received_at: string };
/** `recording`: both switches on (D-065), so she may record and hear a note back; off, she uses the form. */
export type MyVoice = { classes: VoiceClass[]; notes: QueuedNote[]; recording: boolean };

/** "K2 A": a class as she reads it, its grade by name, never by code ("Grade 10 U85", not "G10 U85"). */
export const classWords = (c: Pick<VoiceClass, "grade" | "section" | "gradeName">) =>
  c.section.startsWith(c.grade) ? c.section : `${c.gradeName ?? c.grade} ${c.section}`;
