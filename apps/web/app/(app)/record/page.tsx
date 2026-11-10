import { notFound } from "next/navigation";
import Link from "@/components/link";
import { KeyValue } from "@/components/key-value";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { chosenClass, herVoice, schoolToday } from "@/lib/voice-page";
import { sessionOf, sessionsOfDay } from "@/lib/period";
import { Recorder } from "../voice/record/recorder";
import { ClassChoice } from "../voice/class-choice";
import { PeriodField, TypeMarks } from "./choose";

// Record a note (UI-3a): one button, the activity already known. A period chosen (or arriving from one) is the note's session;
// "Type the marks" makes the empty note for it and opens it on the confirm screen. A phone that will not record shows the typed
// path as the main action, never as an error. Recording needs its own switch (D-065); without it only typing is offered.
const UUID = /^[0-9a-f-]{36}$/;

export default async function Record({ searchParams }: { searchParams: Promise<{ class?: string; session?: string; typed?: string }> }) {
  const me = await requireStaff();
  const my = await herVoice(me);
  const q = await searchParams;
  const picked = q.session && UUID.test(q.session) ? await sessionOf(q.session) : null;
  if (q.session && !picked) notFound();
  const c = chosenClass(my, picked?.class_id ?? q.class);
  if (picked && c?.id !== picked.class_id) notFound();
  const day = await schoolToday();
  const periods = c ? await sessionsOfDay(c.id, day) : [];
  const session = picked ?? periods.find((p) => p.id === q.session);
  const edges: Edge[] = [
    ...(picked ? [{ screen: "period", params: { id: picked.id }, label: "The period", icon: "period" as const }] : []),
    ...(picked?.activity ? [{ screen: "activity", params: { code: picked.activity.code }, label: "The activity", icon: "activity" as const }] : []),
    ...(c ? [{ screen: "picture", params: { class: c.id }, label: "The class", icon: "class" as const }] : []),
  ];
  return (
    <Screen
      stage={`${c?.words ?? "Your classes"}${picked ? ` · ${picked.activity?.name ?? picked.text}` : ""}`}
      title="Record a note"
      purpose="Say what happened and who, by Sr. number. The reader turns it into marks; you confirm them, one note at a time."
      action={
        c && my.recording ? (
          <Recorder classId={c.id} sessionId={picked?.id} say="Say what happened and who, by Sr. number." form={`/voice/form?class=${c.id}`} goto={(id) => `/notes/${id}`} typed={<TypeMarks classId={c.id} sessionId={picked?.id} main />} />
        ) : c ? (
          <TypeMarks classId={c.id} sessionId={picked?.id} main />
        ) : (
          <Link href="/notes" className="btn secondary">
            Notes
          </Link>
        )
      }
      next={{ href: "/notes", label: "Notes to confirm" }}
      rail={<Rail edges={edges} />}
    >
      {c ? (
        <div className="grid max-w-xl gap-4">
          <PeriodField classId={c.id} chosen={session?.id} options={periods.map((p) => ({ id: p.id, label: `${p.starts_at} · ${p.name}` }))} />
          <KeyValue
            rows={[
              { label: "Activity", value: picked?.activity?.name ?? "Not chosen" },
              { label: "Class", value: c.words },
              { label: "Time", value: picked?.starts_at ?? "—", num: true },
              { label: "Kept", value: "Recordings and transcripts are cleared after 48 hours." },
            ]}
          />
          {my.recording ? <TypeMarks classId={c.id} sessionId={picked?.id} /> : null}
        </div>
      ) : (
        <ClassChoice my={my} href={(id) => `/record?class=${id}`} />
      )}
    </Screen>
  );
}
