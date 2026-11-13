import Link from "@/components/link";
import type { Edge } from "@/components/app-frame";
import type { Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { PeekChip } from "@/components/peek-names";
import type { Session } from "@/lib/auth";
import { sql } from "@/lib/db";
import { activityNames, childrenByIds, classNotes, rosterOf, type ClassNote } from "@/lib/notes-loop";
import { schoolZone } from "@/lib/school-clock";
import { draftOf, myVoice } from "@/lib/voice";
import { classWords } from "@/lib/voice-types";
import { W } from "@/lib/voice-words";
import { Body, Late } from "../voice/notes/[id]/parts";
import { confirmHere } from "./actions";
import { Correct } from "./[id]/correct";

// One note in the detail panel (page charter Part C, "Notes / A note": a Workspace, the list on the left, the note and its marks on the
// right). Read once for both places it is shown: beside the Notes list (`/notes?open=note:<id>&tab=`) and opened full page at its own
// address (/notes/<id>). Tabs Marks (what the reader flagged, her words beside the class marked from them, Confirm this note; a confirmed
// note's Correct this note) · Children (the children the note names). A note is read for its author only: anyone else gets none.
const UUID = /^[0-9a-f-]{36}$/;
export type NoteRead = NonNullable<Awaited<ReturnType<typeof noteOf>>>;

export async function noteOf(me: Session, id: string) {
  if (!UUID.test(id)) return null;
  const my = await myVoice(me);
  if (!my) return null;
  const draft = await draftOf(me, id);
  if (!draft) return null;
  const queued = my.notes.find((n) => n.id === id);
  // a confirmed or unconfirmed note is not in the queue: find its class by asking each of hers for the day it was received
  const zone = await schoolZone();
  const day = new Date(draft.received_at).toLocaleDateString("en-CA", { timeZone: zone });
  let found = queued ? my.classes.find((x) => x.id === queued.class_id) : undefined;
  let note: ClassNote | undefined;
  for (const c of found ? [found] : my.classes) {
    const got = await classNotes(me, c.id, day);
    const hit = got?.notes.find((n) => n.note_id === id);
    if (hit) [found, note] = [c, hit];
  }
  if (!found) return null;
  const [names, kids, roster] = await Promise.all([activityNames(draft.activity ? [draft.activity] : []), childrenByIds(me, note?.children ?? []), rosterOf(me, found.id)]);
  const marks =
    draft.status === "confirmed"
      ? await sql<{ id: string; child_id: string; outcome: string }[]>`
          select o.id, o.child_id, o.outcome from activity_observation o
          where o.note_id = ${id} and not exists (select 1 from activity_observation s where s.supersedes = o.id)`
      : [];
  const heard = new Date(draft.received_at).toLocaleString("en-IN", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false });
  return { id, draft, note, klass: classWords(found), classId: found.id, grade: found.grade, names, kids, roster, marks, heard, zone, recording: my.recording };
}

/** The note's name in a list and in the panel's title: its activity, else how it came in. */
export const noteTitle = (n: { activity?: string | null; typed?: boolean }, names: Record<string, string>) =>
  n.activity ? (names[n.activity] ?? `Activity ${n.activity}`) : n.typed ? "Typed marks" : "A voice note";

/** Where the note leads: its lesson, its activity, its class. */
export function noteEdges(n: NoteRead): Edge[] {
  return [
    ...(n.note?.session_id ? [{ screen: "period", params: { id: n.note.session_id }, label: "The period", icon: "period" as const }] : []),
    ...(n.draft.activity ? [{ screen: "activity", params: { code: n.draft.activity }, label: n.names[n.draft.activity] ?? "The activity", icon: "activity" as const }] : []),
    { screen: "picture", params: { class: n.classId }, label: "The class", icon: "class" as const },
  ];
}

/** The note as the panel opens it. `panel`: beside the list (a confirm then opens the next note waiting there, a correction returns there);
 *  without it, the note's own full page. */
export function noteOpened(n: NoteRead, o: { tab?: string; closeHref?: string; full?: string; panel?: boolean }): Opened {
  const { id, draft, note, kids } = n;
  const here = o.panel ? `/notes?${new URLSearchParams({ open: `note:${id}`, tab: "marks" })}` : `/notes/${id}`;
  // a note that could not be read is typed instead, on the lesson it is about (page charter B4), or from Today when it names none
  const form = { href: note?.session_id ? `/period/${note.session_id}` : "/today", label: W.typeMarks };
  // the children the note names, as the Notes list names them (its read claims, and once confirmed its marks)
  const named = (note?.children ?? []).flatMap((cid) => (kids[cid] ? [kids[cid]] : []));
  return {
    key: `note:${id}`,
    kind: "note",
    title: noteTitle({ activity: draft.activity, typed: note?.typed }, n.names),
    line: `${n.klass} · note of ${n.heard}`,
    full: o.full,
    closeHref: o.closeHref,
    actions: (
      <div className="flex flex-wrap items-center gap-3 text-[length:var(--text-label)]" data-note-head>
        <span className="font-medium">{n.klass}</span>
        <Late draft={draft} zone={n.zone} />
        {note?.typed ? null : n.recording ? <audio controls preload="none" src={`/api/voice/${id}`} aria-label={W.confirm.play} className="h-9 max-w-full" /> : null}
      </div>
    ),
    tab: o.tab,
    tabs: [
      {
        key: "marks",
        label: "Marks",
        body: (
          <>
            {note && note.problems.length && draft.status !== "confirmed" ? (
              <ol className="mb-4 grid gap-2" aria-label="What the reader flagged" data-flagged>
                {note.problems.map((p) => (
                  <li key={p} className="border border-[var(--state-late)] bg-[var(--state-late-bg)] px-3 py-2 text-[length:var(--text-body)]">
                    {p}
                  </li>
                ))}
              </ol>
            ) : null}
            <Body draft={draft} klass={n.klass} grade={n.grade} form={form} send={confirmHere.bind(null, id, n.classId, !!o.panel)} done={{ href: "/notes", label: "Notes" }} typed={note?.typed} roster={n.roster} />
            {draft.status === "confirmed" ? <Correct back={here} marks={n.marks.map((m) => ({ observation: m.id, no: kids[m.child_id]?.no ?? "", outcome: m.outcome }))} /> : null}
          </>
        ),
      },
      {
        key: "children",
        label: "Children",
        body: named.length ? (
          <ul className="flex flex-wrap items-center gap-2" aria-label="The children named" data-named>
            {named.map((k) => (
              <li key={k.id}>
                <PeekChip kid={{ ...k, href: `/children/${k.classId}/${Number(k.no)}`, classId: k.classId, roll: String(Number(k.no)) }} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No child is named in this note yet.</EmptyState>
        ),
      },
    ],
  };
}

/** The link that opens a note beside the list: the list's own address with the note named. */
export function OpenNote({ href, id, children, className }: { href: string; id: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} scroll={false} data-open-key={`note:${id}`} className={className}>
      {children}
    </Link>
  );
}
