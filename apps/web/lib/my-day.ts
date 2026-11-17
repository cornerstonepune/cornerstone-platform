// My day, laid out (CP-69, specs/CP-69/spec.md). Pure: the day switcher's days, the time filter's window, and the board's lanes. What waits is the
// person's tasks (lib/todo.ts) and, for the school's version, the school's counts (lib/today-school.ts); what was finished comes from
// lib/my-day-done.ts. One card for each kind and class, in the lane its urgency gives it. Nothing is read here, nothing ranks a person.
import type { KCard, Lane } from "@/components/kanban-board";
import type { Kind as Tile } from "@/components/kind-tile";
import type { State } from "@/components/status-chip";
import type { Finished } from "./my-day-done";
import { count, KINDS, TODO_GROUPS, type Kind, type Task } from "./todo";
import { SCHOOL_URGENCY, type WaitRow } from "./today-waiting";
import type { Wait } from "./today-school";

const DAY_MS = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** A day in words, day before month: "Mon 23 Nov". */
export function dateWords(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

export type Period = "today" | "week" | "month";
export const PERIODS: readonly { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];
export const periodOf = (s: string | undefined): Period => PERIODS.find((p) => p.key === s)?.key ?? "week";

/** School days from `from`, counted, up to `to`, not counted. */
export type Window = { from: string; to: string };
/** The days a period covers, around the chosen day: that day; its week (Monday to Sunday); its calendar month. */
export function windowOf(day: string, period: Period): Window {
  if (period === "today") return { from: day, to: addDays(day, 1) };
  if (period === "week") {
    const back = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    const monday = addDays(day, -back);
    return { from: monday, to: addDays(monday, 7) };
  }
  const first = `${day.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { from: first, to: next };
}

export type LaneKey = "now" | "week" | "ready" | "done";
const LANES: { key: LaneKey; label: string; state: State; empty: string }[] = [
  { key: "now", label: "Do now", state: "doNow", empty: "Nothing is late." },
  { key: "week", label: "This week", state: "doSoon", empty: "Nothing waits this week." },
  { key: "ready", label: "When ready", state: "whenReady", empty: "Nothing is waiting for later." },
  { key: "done", label: "Done", state: "done", empty: "Nothing was finished in this period." },
];
const LANE_OF = ["now", "week", "ready"] as const;

const TILE: Record<Kind, Tile> = { check: "assessment", signoff: "assessment", classpaper: "assessment", home: "assessment", generate: "assessment", empty: "assessment", report: "note", skill: "skill", ask: "skill", taught: "objective", note: "note", record: "note" };
const OF = (k: Kind) => TODO_GROUPS.find((g) => g.kinds.includes(k))?.of ?? (["item", "items"] as const);
const HOME = (k: Kind) => TODO_GROUPS.find((g) => g.kinds.includes(k))?.home ?? "/my-day";
const DONE_WORDS: Record<Finished["kind"], string> = {
  check: "Answers checked",
  signoff: "Papers signed off",
  classpaper: "Class papers approved",
  home: "Home assessments approved",
  report: "Parent reports approved",
  ask: "Questions answered",
  empty: "Scans read again",
  taught: "Topics marked as taught",
  generate: "Assessments made",
  note: "Notes confirmed",
  record: "Notes recorded",
  skill: "Skills approved",
  clash: "Clashes settled",
  draft: "Timetable drafts approved",
};
const DONE_HOME: Partial<Record<Finished["kind"], string>> = { clash: "/timetable/fortnight", draft: "/timetable/fortnight" };
export const everyClass = "Every class";
const classOf = (s: string) => s || everyClass;
/** What a card's address and tests read: the kind, and the class ("" is the school's or every class's). */
const cardAttrs = (kind: string, section: string): Record<string, string> => ({ "data-card-kind": kind, "data-card-class": section });

/** One card for each kind and class of what waits, with the row the right-hand panel opens on (its tasks, each with its own action). */
export type Waiting = { lane: LaneKey; card: KCard; row: WaitRow };

export function waitingCards(tasks: readonly Task[], school: readonly Wait[], door: (w: Wait) => string | null, at: (key: string) => string): Waiting[] {
  // a card's key is what `?open=` carries (components/detail-panel.tsx parseOpen: letters, digits, "_", "~", "." and "-"), so a class's label is
  // written with those only
  const by = new Map<string, { section: string; tasks: Task[] }>();
  for (const t of tasks)
    if (t.kind !== "skill")
      for (const c of t.sections.length ? t.sections : [""]) {
        const key = `${t.kind}~${c.replace(/[^\w.-]/g, "_")}`;
        by.set(key, { section: c, tasks: [...(by.get(key)?.tasks ?? []), t] });
      }
  const mine = [...by].map(([key, { section, tasks: ts }]): Waiting => {
    const kind = ts[0].kind;
    const first = ts[0];
    const [one, more] = OF(kind);
    const many = count(ts.length, one, more);
    const row: WaitRow = { key, what: KINDS[kind].what, many, state: first.state, go: first.action, href: first.href, home: HOME(kind), tasks: ts };
    const card: KCard = { key, kind: TILE[kind], title: KINDS[kind].what, sub: classOf(section), progress: many, href: at(key), openKey: `wait:${key}`, state: first.state, action: { href: first.href, label: first.action }, attrs: cardAttrs(kind, section) };
    return { lane: LANE_OF[KINDS[kind].rank], card, row };
  });
  const school_ = school.map((w): Waiting => {
    const key = `school-${w.key}`;
    const href = door(w);
    const row: WaitRow = { key, what: w.what, many: w.many, state: w.state, go: w.go, href, home: href, tasks: [] };
    const card: KCard = { key, kind: w.key === "late" ? "note" : w.key === "materials" ? "activity" : "period", title: w.what, sub: everyClass, progress: w.many, href: at(key), openKey: `wait:${key}`, state: w.state, ...(href ? { action: { href, label: w.go } } : {}), attrs: cardAttrs(key, "") };
    return { lane: LANE_OF[SCHOOL_URGENCY[w.key]], card, row };
  });
  return [...school_, ...mine];
}

/** One card for each kind and class that was finished in the period, the latest first. A card links to the page that does that work. */
export function doneCards(done: readonly Finished[]): KCard[] {
  const by = new Map<string, { kind: Finished["kind"]; section: string; n: number; at: string }>();
  for (const f of done) {
    const k = `${f.kind}|${f.section}`;
    const had = by.get(k);
    by.set(k, { ...f, n: (had?.n ?? 0) + f.n, at: had && had.at > f.at ? had.at : f.at });
  }
  return [...by.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((f): KCard => {
      const one = f.kind in KINDS ? OF(f.kind as Kind) : (["item", "items"] as const);
      const home = f.kind in KINDS ? HOME(f.kind as Kind) : (DONE_HOME[f.kind] ?? "/my-day");
      return {
        key: `done|${f.kind}|${f.section}`,
        kind: f.kind in TILE ? TILE[f.kind as Kind] : "period",
        title: DONE_WORDS[f.kind],
        sub: classOf(f.section),
        progress: f.kind === "note" ? count(f.n, "note") : count(f.n, one[0], one[1]),
        href: home,
        state: "done",
        attrs: cardAttrs(f.kind, f.section),
      };
    });
}

export type Filters = { section?: string; kinds?: readonly string[] };
/** The finished rows the class and kind filters leave: a row of no class belongs to every class's view. */
export const narrowDone = (done: readonly Finished[], f: Filters): Finished[] => done.filter((d) => (!f.section || !d.section || d.section === f.section) && (!f.kinds || f.kinds.includes(d.kind)));

/** The four lanes of the board, in the order a person reads them. */
export function lanes(waiting: readonly Waiting[], done: readonly KCard[]): Lane[] {
  return LANES.map((l) => {
    const cards = l.key === "done" ? done : waiting.filter((w) => w.lane === l.key).map((w) => w.card);
    return { key: l.key, label: l.label, state: l.state, count: cards.length, empty: l.empty, cards };
  });
}
