import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { PeekChip, PeekHost } from "@/components/peek-names";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { activityNames, childrenByIds, classNotes, type ClassNote } from "@/lib/notes-loop";
import { schoolZone } from "@/lib/school-clock";
import { draftOf } from "@/lib/voice";
import { herVoice } from "@/lib/voice-page";
import { classWords } from "@/lib/voice-types";
import { W } from "@/lib/voice-words";
import { Body, Late } from "../../voice/notes/[id]/parts";
import { confirmHere } from "../actions";
import { Correct } from "./correct";

// Confirm what the reader heard (UI-3a), one note a screen: her words line by line on the left, the class already marked from
// them on the right (the same board as /voice/notes/[id]), the reader's problems pinned in red, Confirm for this note only. A
// confirmed note is opened here too, where "Correct this note" lives. Its next step is the next note waiting, or Notes.
const UUID = /^[0-9a-f-]{36}$/;

export default async function ConfirmWhatTheReaderHeard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireStaff();
  const my = await herVoice(me);
  const draft = await draftOf(me, id);
  if (!draft) notFound();
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
  if (!found) notFound();
  const klass = classWords(found);
  const names = await activityNames(draft.activity ? [draft.activity] : []);
  const kids = await childrenByIds(me, note?.children ?? []);
  const form = { href: `/voice/form?class=${found.id}`, label: W.fillForm };
  const heard = new Date(draft.received_at).toLocaleString("en-IN", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false });
  const marks =
    draft.status === "confirmed"
      ? await sql<{ id: string; child_id: string; outcome: string }[]>`
          select o.id, o.child_id, o.outcome from activity_observation o
          where o.note_id = ${id} and not exists (select 1 from activity_observation s where s.supersedes = o.id)`
      : [];
  const edges: Edge[] = [
    ...(note?.session_id ? [{ screen: "period", params: { id: note.session_id }, label: "The period", icon: "period" as const }] : []),
    ...(draft.activity ? [{ screen: "activity", params: { code: draft.activity }, label: names[draft.activity] ?? "The activity", icon: "activity" as const }] : []),
    { screen: "picture", params: { class: found.id }, label: "The class", icon: "class" as const },
  ];
  return (
    <PeekHost>
      <Screen
        stage={`${klass} · note of ${heard}${draft.activity ? ` · ${names[draft.activity] ?? ""}` : ""}`}
        title="Confirm what the reader heard"
        purpose="Left, your words line by line. Right, the class marked from them. Nothing is ticked for you. Confirm is for this note only."
        action={
          <Link href="/notes" className="btn secondary">
            All notes
          </Link>
        }
        next={{ href: "/notes", label: "Notes" }}
        rail={<Rail edges={edges} />}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px]" data-note-head>
          <span className="font-medium">{klass}</span>
          <Late draft={draft} zone={zone} />
          {note?.typed ? null : my.recording ? <audio controls preload="none" src={`/api/voice/${id}`} aria-label={W.confirm.play} className="h-9 max-w-full" /> : null}
        </div>
        {note && note.problems.length && draft.status !== "confirmed" ? (
          <ol className="mb-4 grid gap-2" aria-label="What the reader flagged" data-flagged>
            {note.problems.map((p) => (
              <li key={p} className="border border-[var(--state-late)] bg-[var(--state-late-bg)] px-3 py-2 text-[15px]">
                {p}
              </li>
            ))}
          </ol>
        ) : null}
        {note?.claims.length ? (
          <ul className="mb-4 flex flex-wrap items-center gap-2" aria-label="The children named" data-named>
            {note.children.flatMap((cid) => (kids[cid] ? [<li key={cid}><PeekChip kid={{ ...kids[cid], href: `/children/${kids[cid].classId}/${Number(kids[cid].no)}`, classId: kids[cid].classId, roll: String(Number(kids[cid].no)) }} /></li>] : []))}
          </ul>
        ) : null}
        <Body draft={draft} klass={klass} grade={found.grade} form={form} send={confirmHere.bind(null, id, found.id)} done={{ href: "/notes", label: "Notes" }} />
        {draft.status === "confirmed" ? <Correct back={`/notes/${id}`} marks={marks.map((m) => ({ observation: m.id, no: kids[m.child_id]?.no ?? "", outcome: m.outcome }))} /> : null}
      </Screen>
    </PeekHost>
  );
}
