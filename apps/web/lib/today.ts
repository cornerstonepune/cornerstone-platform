// Today (UI-7): the rules that turn what the engine says into what the screen shows. Pure, so a test can read them.
// Nothing here ranks or scores a person: every figure is a whole count of rows (docs/frontend/SPEC.md, Today).
import { chipOf } from "./educator/chip";
import { timeOf } from "./educator/period";
import type { Period, SessionState } from "./educator/types";
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

const SUBJECT: [RegExp, Subject][] = [
  [/num|math/i, "numeracy"],
  [/lang|eng|hin|mar|read|writ|lit/i, "language"],
];
const subjectOf = (p: Pick<Period, "kind" | "subject">): Subject => (p.kind === "fixed" || p.kind === "empty" ? "fixed" : (SUBJECT.find(([re]) => re.test(p.subject ?? ""))?.[1] ?? "arts"));

/** What a period's state chip says: only from what was recorded. A fixed part of the day has none. */
const STATE: Record<SessionState, State | undefined> = { planned: undefined, done: "done", not_done: "notDone", moved: "moved" };

/** A period as PeriodRow draws it. `href` is where it opens; the lit one is `now`. */
export function periodRow(p: Period, lit: string | null, href: string): Row {
  return { time: timeOf(p), subject: subjectOf(p), name: p.name, fact: p.activity?.name ?? p.line ?? undefined, state: p.kind === "fixed" || p.kind === "empty" ? undefined : STATE[p.state], now: p.period_id === lit, href };
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
