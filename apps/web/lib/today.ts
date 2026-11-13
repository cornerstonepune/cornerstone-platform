// Today (UI-7): the rules that turn what the engine says into what the screen shows. Pure, so a test can read them.
// Nothing here ranks or scores a person: every figure is a whole count of rows (docs/frontend/SPEC.md, Today).
import { chipOf } from "./educator/chip";
import { timeOf } from "./educator/period";
import type { Period } from "./educator/types";
import type { Period as Row, Subject } from "@/components/period-row";
import type { State } from "@/components/status-chip";

export type NoteRef = { id: string; class_id: string; status: string; received_at: string };

/** The notes still to confirm, split by age: past `hours` is "do now", younger is "this week". The two never overlap, so
 *  a note is counted once (the strip's number is the sum of its two tiles). */
export function splitNotes(notes: readonly NoteRef[], now: number, hours: number): { late: NoteRef[]; soon: NoteRef[] } {
  const late: NoteRef[] = [];
  const soon: NoteRef[] = [];
  for (const n of [...notes].sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at))) (now - Date.parse(n.received_at) >= hours * 3_600_000 ? late : soon).push(n);
  return { late, soon };
}

/** The lit row: the lesson whose period holds the current time. Before the first period (08:30) none is lit; a break is never lit. */
export const litPeriod = (periods: readonly Period[], now: string): string | null => periods.find((p) => chipOf(p, { now, day: "today" }) === "doNow")?.period_id ?? null;

/** Where a lesson stands in the day, the three words Today's timeline says (page charter B1): taught, running now, or the next to come. */
export type Mark = "done" | "now" | "next";
const MARK: Record<Mark, State> = { done: "done", now: "teachingNow", next: "nextUp" };

/** The marks of a day's lessons and the lesson the panel opens on when the address names none: the one now, else the next, else (the
 *  day over) the last one begun, else the first. `when`: the day shown against the school's today. A lesson is "done" only when the engine
 *  says it was recorded; none is guessed. */
export function dayMarks(lessons: readonly Period[], now: string, when: "past" | "today" | "future"): { marks: Record<string, Mark>; chosen: string | null } {
  const marks: Record<string, Mark> = {};
  for (const p of lessons) if (p.state === "done") marks[p.period_id] = "done";
  const lit = when === "today" ? litPeriod(lessons, now) : null;
  if (lit && !marks[lit]) marks[lit] = "now";
  const next = when === "past" ? undefined : lessons.find((p) => p.state !== "done" && p.period_id !== lit && (when === "future" || p.starts_at > now));
  if (next) marks[next.period_id] = "next";
  const begun = when === "future" ? [] : lessons.filter((p) => when === "past" || p.starts_at <= now);
  return { marks, chosen: lit ?? next?.period_id ?? begun.at(-1)?.period_id ?? lessons[0]?.period_id ?? null };
}

/** A lesson as Today's timeline draws it: time, the subject's colour and word, the activity's name, its mark. `look`: the subject row's
 *  colour (lib/subject-looks.ts), `words` its word; `open`: the panel key the row opens, and whether it is the one open. */
export function lessonRow(p: Period, look: Exclude<Subject, "fixed">, words: string, mark: Mark | undefined, href: string, open?: { key: string; selected: boolean }): Row {
  return {
    time: timeOf(p),
    subject: look,
    name: p.activity?.name ?? p.name,
    fact: p.activity ? `${words} · ${p.name}` : `${words} · no activity yet`,
    state: mark ? MARK[mark] : undefined,
    now: mark === "now",
    href,
    ...(open ? { openKey: open.key, selected: open.selected } : {}),
  };
}

/** Periods taught of planned: the lessons only (a break is not planned work). */
export function periodsDone(periods: readonly Pick<Period, "kind" | "state">[]): { done: number; planned: number } {
  const lessons = periods.filter((p) => p.kind !== "fixed" && p.kind !== "empty");
  return { done: lessons.filter((p) => p.state === "done").length, planned: lessons.length };
}

/** "Wednesday 18-Nov": the eyebrow's day. */
export function dayWords(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  const mon = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${wd} ${String(d.getUTCDate()).padStart(2, "0")}-${mon}`;
}

/** "Fortnight 9, week A" (or "" when the day is on no fortnight). */
export const fortnightWords = (f: { number: number } | null, week: "A" | "B" | null) => (f ? `Fortnight ${f.number}${week ? `, week ${week}` : ""}` : "");

/** A count in words: "1 note", "3 notes". */
export const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;
