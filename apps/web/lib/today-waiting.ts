// What waits on a person, as Today counts and lists it (page charter B1, B1b and Part C: What needs doing merges into the coordinator's
// Today as its "waiting on you" list). The rows are What needs doing's own (lib/todo.ts, read by lib/queries-todo.ts) and the school's
// counts (lib/today-school.ts); this file only counts and orders them, so the tiles and the list are one reading. Pure but for `myTasks`.
import type { Session } from "./auth";
import { choices } from "./choices";
import { deadline } from "./deadline";
import { tasksFor } from "./queries-todo";
import { count, filterTasks, sectionsOf, type Kind, type Task } from "./todo";
import { subjectsFor } from "./viewing";
import { STATES, type State } from "@/components/status-chip";
import type { Wait } from "./today-school";

/** A paper's answers to check or sign off: the "papers to check" tile. */
export const PAPER_KINDS: readonly Kind[] = ["check", "signoff"];
/** What the coordinator approves on Today: class papers, home assessments, parent reports (and the timetable's drafts, from the counts).
 *  Skills to approve are not among them: their count is the eyebrow of Skills to approve and appears on neither Today (specs/UI-7 #3). */
export const APPROVAL_KINDS: readonly Kind[] = ["classpaper", "home", "report"];

/** Every task waiting on this person, in their subjects and classes, as What needs doing lists them; null when it could not be read in time. */
export async function myTasks(me: Session): Promise<Task[] | null> {
  try {
    const [all, offered] = await Promise.all([deadline(tasksFor(me)), deadline(choices())]);
    return filterTasks(all, {}, subjectsFor(me, offered.subjects).map((s) => s.code));
  } catch {
    return null;
  }
}

export const papersToCheck = (tasks: readonly Task[]) => tasks.filter((t) => PAPER_KINDS.includes(t.kind)).length;
export const approvalsWaiting = (tasks: readonly Task[], drafts: number) => tasks.filter((t) => APPROVAL_KINDS.includes(t.kind)).length + drafts;

/** One row of "waiting on you": what it is, how many, its state, and its one action (`href` none when the page that does it is not live), and the page that holds all of it (`home`). */
export type WaitRow = { key: string; what: string; many: string; state: State; go: string; href: string | null; home: string | null; tasks: Task[] };

const URGENCY = { act: 0, wait: 1, ok: 2, quiet: 2 } as const;
/** The school's rows by how soon they are due: a clash and a note past its time now, a draft and a materials line this week, last week's
 *  lessons not done when ready (their chips are words of what they are, not of when, so the order is said here). */
const SCHOOL_URGENCY: Record<Wait["key"], number> = { clash: 0, late: 0, draft: 1, materials: 1, undone: 2 };

/** The rows, most urgent first (red, then amber, then the rest, each kept in the order the work happens): the school's counts as they come
 *  (clashes, late notes, drafts, lessons not done, materials) and What needs doing's groups, one row each, skills to approve left out. */
export function waitingRows(school: readonly Wait[], door: (w: Wait) => string | null, tasks: readonly Task[]): WaitRow[] {
  const rows: (WaitRow & { due: number })[] = [
    ...school.map((w) => ({ key: `school-${w.key}`, what: w.what, many: w.many, state: w.state, go: w.go, href: door(w), home: door(w), tasks: [], due: SCHOOL_URGENCY[w.key] })),
    ...sectionsOf(tasks.filter((t) => t.kind !== "skill")).map((s) => ({
      key: `group-${s.group.key}`,
      what: s.title,
      many: count(s.tasks.length, ...s.group.of),
      state: s.state,
      go: s.next.action,
      href: s.next.href,
      home: s.group.home,
      tasks: s.tasks,
      due: URGENCY[STATES[s.state].tone],
    })),
  ];
  return rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.due - b.r.due || a.i - b.i).map(({ r: { due, ...r } }) => (void due, r));
}
