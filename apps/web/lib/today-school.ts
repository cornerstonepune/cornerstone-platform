// The school's Today as whole numbers laid out (UI-7, specs: docs/frontend/SPEC.md "Today, the school"). The engine's `POST /k2/today-school`
// (CP-28) counts; this file only arranges. Nothing here ranks, scores or orders a person or a class by how it did: classes keep the
// order the school lists them in (grade, then section), and every figure is a count of rows.
import type { State } from "@/components/status-chip";

export type Cell = { grade: string; section: string | null; day: string; state: "done" | "moved" | "not_done" | "holiday" | "none" };
export type School = {
  clashes: number;
  drafts: { count: number; rows: { fortnight: number; grade: string; section: string | null }[] };
  late_notes: number;
  materials_no_quantity: { count: number; rows: { grade: string; lines: number }[] };
  last_week: { cells: Cell[]; sessions_done: number; sessions_planned: number };
  next_week: { from: string; new_activities: { code: string; name: string; subject: string | null; classes: string[] }[] };
  ready: { children: number; children_with_consent: number; activities: number; activities_ready: number; materials: number; materials_with_quantity: number };
};

/** A class as the school says it: "K2 A" (the section may already hold the grade). */
export const classLabel = (c: { grade: string; section: string | null }) => (!c.section ? c.grade : c.section.startsWith(c.grade) ? c.section : `${c.grade} ${c.section}`);

const CELL: Record<Cell["state"], State> = { done: "done", moved: "moved", not_done: "notDone", holiday: "holiday", none: "notYet" };

/** Last week as the heat grid: a column for each day any class has, a row for each class in the order the engine lists them, one cell
 *  for each class and day. A day a class has no cell for is a holiday for it as for the rest; nothing is dropped. */
export function heat(cells: readonly Cell[], href?: (c: Cell) => string | null): { days: string[]; rows: { label: string; cells: State[]; hrefs?: (string | null)[] }[] } {
  const days = [...new Set(cells.map((c) => c.day))].sort();
  const order: string[] = [];
  const by = new Map<string, Map<string, Cell>>();
  for (const c of cells) {
    const k = classLabel(c);
    if (!by.has(k)) {
      by.set(k, new Map());
      order.push(k);
    }
    by.get(k)!.set(c.day, c);
  }
  const word = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  return { days: days.map(word), rows: order.map((label) => ({ label, cells: days.map((d) => CELL[by.get(label)!.get(d)?.state ?? "holiday"]), ...(href ? { hrefs: days.map((d) => { const c = by.get(label)!.get(d); return c ? href(c) : null; }) } : {}) })) };
}

export type Wait = { key: "clash" | "draft" | "late" | "undone" | "materials"; state: State; what: string; n: number; many: string; go: string };

const plural = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;

/** The rows that wait on the coordinator, red first, each only when there is something: a clash, drafts to approve, notes left
 *  unconfirmed, lessons not done last week, materials lines with no quantity. */
export function waiting(s: School): Wait[] {
  const undone = Math.max(0, s.last_week.sessions_planned - s.last_week.sessions_done);
  return [
    { key: "clash" as const, go: "Open the clashes", state: "clash" as const, what: "Two lessons at once, not accepted", n: s.clashes, many: plural(s.clashes, "clash", "clashes") },
    { key: "late" as const, go: "Open the notes", state: "late" as const, what: "Notes left unconfirmed", n: s.late_notes, many: plural(s.late_notes, "note") },
    { key: "draft" as const, go: "Open the drafts", state: "toApprove" as const, what: "Timetable drafts to approve", n: s.drafts.count, many: plural(s.drafts.count, "draft") },
    { key: "undone" as const, go: "Open staff and classes", state: "notDone" as const, what: "Lessons not done last week", n: undone, many: plural(undone, "lesson") },
    { key: "materials" as const, go: "Open the materials", state: "waiting" as const, what: "Materials lines with no quantity next week", n: s.materials_no_quantity.count, many: plural(s.materials_no_quantity.count, "line") },
  ].filter((w) => w.n > 0);
}

/** The three tiles: do now = clashes and late notes; this week = drafts and materials lines; done = lessons done of planned last week. */
export function tiles(s: School): { doNow: number; soon: number; done: number; planned: number } {
  return { doNow: s.clashes + s.late_notes, soon: s.drafts.count + s.materials_no_quantity.count, done: s.last_week.sessions_done, planned: s.last_week.sessions_planned };
}

/** "Does the system have what it needs", as pairs of counts. */
export function readiness(r: School["ready"]): { label: string; have: number; of: number }[] {
  return [
    { label: "children with consent on file", have: r.children_with_consent, of: r.children },
    { label: "activities with steps and three levels", have: r.activities_ready, of: r.activities },
    { label: "materials with a quantity", have: r.materials_with_quantity, of: r.materials },
  ];
}
