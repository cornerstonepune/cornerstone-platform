import { cache } from "react";
import type { Session } from "./auth";
import { sql } from "./db";
import { EngineDown, engineSend } from "./engine";
import { seesClass } from "./reach";
import type { Peeked } from "@/components/child-peek";

// What the four screens of the notes loop (period, record, confirm, notes) read, beyond the voice helpers: a class's notes
// from the engine (issue #565: POST /voice/class-notes, her own notes of a class she holds), the typed note, and the
// children a note names, as a person reads them. Behind `voice.screens_enabled`, through lib/voice-page.ts (`herVoice`).

export type NoteState = "being_read" | "fix_this" | "to_confirm" | "left_unconfirmed" | "confirmed";
export type ClassNote = {
  note_id: string;
  /** the class and its words, on the coordinator's list */
  class_id?: string;
  class?: string;
  status: string;
  state: NoteState;
  typed: boolean;
  session_id: string | null;
  received_at: string;
  taught_on: string;
  activity: string | null;
  children: string[];
  problems: string[];
  claims: { section: string; decision: string; read_as: string; kept_as: string | null; children: string[] }[];
};
export type ClassNotes = { notes: ClassNote[]; waiting_by_child: Record<string, number> };

/** Her notes of a class on a day (the engine's own words on a refusal are not needed: a class she does not hold is not found). */
export async function classNotes(me: Pick<Session, "email">, classId: string, day?: string): Promise<ClassNotes | null> {
  const res = await engineSend("/voice/class-notes", { actor: me.email, class_id: classId, ...(day ? { day } : {}) });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as ClassNotes;
}

/** The empty note for typing the marks: its id, or the engine's reason. */
export async function typedNote(me: Pick<Session, "email">, classId: string, sessionId?: string): Promise<{ id: string } | { error: string }> {
  const res = await engineSend("/voice/notes/typed", { actor: me.email, class_id: classId, ...(sessionId ? { session_id: sessionId } : {}) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    return { error: typeof body.detail === "string" ? body.detail : "Not started. Try again." };
  }
  return { id: ((await res.json()) as { note_id: string }).note_id };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The children by id, for those of a class the person may see: Sr. No., name (read through pii.read_child, which logs who asked)
 *  and class. A child outside their reach is left out, never named. */
export const childrenByIds = cache(async (me: Pick<Session, "email" | "role" | "classes" | "subjects" | "id">, ids: string[]): Promise<Record<string, Peeked & { id: string; classId: string }>> => {
  if (!ids.length) return {};
  const rows = await sql<{ id: string; roll_no: string; section: string; class_id: string; first_name: string; last_name: string | null }[]>`
    select c.id, c.roll_no, c.section, c.class_id, n.first_name, n.last_name
    from child_now c, lateral pii.read_child(c.id, ${me.email}) n
    where c.id = any(${ids}::uuid[]) and c.active and ${seesClass(me, sql`c.section`)}`;
  return Object.fromEntries(
    rows.map((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ");
      return [r.id, { id: r.id, classId: r.class_id, no: r.roll_no.padStart(2, "0"), initials: initials(name), name, className: r.section }];
    }),
  );
});

/** The class's children by Sr. No. (no leading zero): initials and name, for the squares of the confirm board. Read through the same audited
 *  function as every other name (`pii.read_child`), and only for the children a person may see. */
export const rosterOf = cache(async (me: Pick<Session, "email" | "role" | "classes" | "subjects" | "id">, classId: string): Promise<Record<string, { name: string; initials: string }>> => {
  const ids = await sql<{ id: string; roll_no: string }[]>`select id::text, roll_no from child_now where class_id = ${classId} and active`;
  const named = await childrenByIds(me, ids.map((r) => r.id));
  return Object.fromEntries(ids.flatMap((r) => (named[r.id] ? [[String(Number(r.roll_no)), { name: named[r.id].name, initials: named[r.id].initials }] as const] : [])));
});

/** The activities' names by code. */
export async function activityNames(codes: string[]): Promise<Record<string, string>> {
  const list = [...new Set(codes.filter(Boolean))];
  if (!list.length) return {};
  const rows = await sql<{ code: string; name: string }[]>`select code, name from activity where code = any(${list}::text[])`;
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}

/** Every educator's notes of every class of the coordinator's campus on a day (coordinators only; null for anyone else). */
export async function coordinatorNotes(me: Pick<Session, "email">, day?: string): Promise<ClassNotes | null> {
  const res = await engineSend("/voice/coordinator-notes", { actor: me.email, ...(day ? { day } : {}) });
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new EngineDown(`The engine refused that (${res.status}).`);
  return (await res.json()) as ClassNotes;
}
