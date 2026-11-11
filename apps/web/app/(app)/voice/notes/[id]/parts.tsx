import Link from "@/components/link";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { ICON_SIZE, Icon, type IconName, MARK_ICON } from "@/lib/icons";
import { daysLate, fromDraft, type Draft } from "@/lib/voice-check";
import { activitiesOf } from "@/lib/voice";
import { schoolToday } from "@/lib/voice-page";
import { MARKS, W } from "@/lib/voice-words";
import { Board, type Sent } from "../../board";
import { Rereads } from "./rereads";

// The pieces of the confirm screen, of /notes/[id] (UI-3a): the late chip, the body (reading,
// could not read, or the words beside the board) and the lines of what she said.

export function Late({ draft, zone }: { draft: Draft; zone: string }) {
  const n = daysLate(draft.taught_on, draft.received_at, zone);
  if (n < 1) return null;
  return <StatusChip state="late" round words={n === 1 ? W.facts.late : W.facts.lateDays(n)} />;
}

export async function Body({ draft, klass, grade, form, send, done, typed }: { draft: Draft; klass: string; grade?: string; form: { href: string; label: string }; send: (s: Sent) => Promise<{ error: string } | void>; done?: { href: string; label: string }; typed?: boolean }) {
  if (draft.status === "confirmed") return <EmptyState next={done ?? { href: "/today?open=notes", label: W.groups.notes }}>{W.confirm.done}.</EmptyState>;
  if (draft.status === "left_unconfirmed") return <EmptyState next={{ href: "/today", label: W.back }}>{W.confirm.expired}</EmptyState>;
  if (draft.status === "received")
    return (
      <section className="panel grid justify-items-start gap-2 p-4" data-reading>
        <StatusChip state="reading" round words={W.confirm.reading} />
        <p className="text-[14px] text-basalt/70">{W.confirm.readingMore}</p>
        <Rereads />
      </section>
    );
  if (draft.kind === "incident")
    return (
      <section className="panel grid justify-items-start gap-2 p-4" data-incident>
        <StatusChip state="late" round words={W.confirm.incident} />
        <Heard draft={draft} />
      </section>
    );
  const said = draft.lines.some((l) => l.section !== "sentence");
  if ((!said && !typed) || !grade) // a typed note has no words to read: it opens on the empty board
    return (
      <section className="panel grid justify-items-start gap-3 p-4" data-could-not>
        <StatusChip state="fixThis" round words={draft.heard ? W.confirm.couldNot : W.record.nothing} />
        <Link href={form.href} className="btn w-fit gap-1.5" data-to-form>
          <Icon name="form" />
          {form.label}
        </Link>
      </section>
    );
  const today = await schoolToday();
  const activities = await activitiesOf(grade);
  if (typed) return <Board start={fromDraft(draft)} enrolled={draft.enrolled} klass={klass} activities={[...activities]} today={today} draft={draft} button={W.confirm.button} send={send} lines={[]} />;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="panel h-fit p-4" aria-label={W.confirm.heard}>
        <h2 className="mb-2 text-[16px]">{W.confirm.heard}</h2>
        <Heard draft={draft} />
      </section>
      <Board start={fromDraft(draft)} enrolled={draft.enrolled} klass={klass} activities={[...activities]} today={today} draft={draft} button={W.confirm.button} send={send} lines={draft.lines.filter((l) => (MARKS as readonly string[]).includes(l.section) && l.numbers.length)} />
    </div>
  );
}

/** One line per draft item beside the words it came from: its mark's icon, its name, her words; a line with trouble says so. */
export function Heard({ draft }: { draft: Draft }) {
  return (
    <ol className="grid gap-2" data-heard>
      {draft.lines.map((l) => {
        const icon: IconName | null = (MARKS as readonly string[]).includes(l.section) ? MARK_ICON[l.section as (typeof MARKS)[number]] : l.section === "rest" ? "as-expected" : l.section === "activity" ? "activity" : l.section === "incident" ? "incident" : l.section === "sentence" ? "note" : null;
        return (
          <li key={l.section} className="grid grid-cols-[1.5rem_7rem_minmax(0,1fr)] items-start gap-2 border-b border-basalt/8 pb-2 text-[15px]" data-line={l.section}>
            <span className="pt-0.5">{icon ? <Icon name={icon} size={ICON_SIZE.table} /> : null}</span>
            <span className="font-medium">{W.marks[l.section as keyof typeof W.marks] ?? W.sections[l.section] ?? l.section}</span>
            <span className="min-w-0">
              “{l.words}”{l.problems.length ? <StatusChip state="fixThis" round compact note={undefined} /> : null}
              {l.notes.map((n) => (
                <span key={n} className="block text-[12.5px] text-basalt/62">
                  {n}
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
