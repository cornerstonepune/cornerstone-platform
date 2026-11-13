// What waits on a person, as Today counts and lists it (page charter B1, B1b and Part C: What needs doing merged into Today as its "waiting
// on you" list; /setup/needs-doing answers 308 to /today). The rows are the tasks of lib/todo.ts (read by lib/queries-todo.ts) and the
// school's counts (lib/today-school.ts); this file only narrows, counts and orders them, so the tiles, the filters and the list are one
// reading. Pure but for `myWork` and `myTasks`.
import type { Session } from "./auth";
import { choices } from "./choices";
import { deadline } from "./deadline";
import { tasksFor } from "./queries-todo";
import { count, filterTasks, KINDS, sectionsOf, TODO_GROUPS, type GroupKey, type Kind, type Task } from "./todo";
import { subjectsFor } from "./viewing";
import { STATES, type State } from "@/components/status-chip";
import type { Wait } from "./today-school";

/** A paper's answers to check or sign off: the "papers to check" tile. */
export const PAPER_KINDS: readonly Kind[] = ["check", "signoff"];
/** What the coordinator approves on Today: class papers, home assessments, parent reports (and the timetable's drafts, from the counts).
 *  Skills to approve are not among them: their count is the eyebrow of Skills to approve and appears on neither Today (specs/UI-7 #3). */
export const APPROVAL_KINDS: readonly Kind[] = ["classpaper", "home", "report"];

/** Every task waiting on this person, in their subjects and classes, and those subjects (the Subject filter's choices); null when it could
 *  not be read in time. */
export async function myWork(me: Session): Promise<{ tasks: Task[]; subjects: { code: string; label: string }[] } | null> {
  try {
    const [all, offered] = await Promise.all([deadline(tasksFor(me)), deadline(choices())]);
    const subjects = subjectsFor(me, offered.subjects);
    return { tasks: filterTasks(all, {}, subjects.map((s) => s.code)), subjects };
  } catch {
    return null;
  }
}

/** Every task waiting on this person (`myWork`'s tasks). */
export const myTasks = async (me: Session): Promise<Task[] | null> => (await myWork(me))?.tasks ?? null;

/** The groups Today's "What" filter offers: every kind of work but the skills to approve, which Today neither counts nor lists. */
export const WORK_GROUPS = TODO_GROUPS.filter((g) => g.key !== "skills");

/** Today's filters, as the address names them: each only when it is one the person has (a subject of theirs, a class with work waiting). `kind`
 *  is the address the old What needs doing page had before it had groups (a bookmark, a link in a message): one kind of task. */
export type WorkFilters = { subject?: string; section?: string; group?: GroupKey; kind?: Kind };
export const SECTION_ORDER = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function workFilters(q: Record<string, string | undefined>, tasks: readonly Task[], subjects: readonly { code: string }[]): { f: WorkFilters; classes: string[] } {
  const classes = [...new Set(tasks.flatMap((t) => t.sections))].sort(SECTION_ORDER);
  return {
    classes,
    f: {
      subject: subjects.find((s) => s.code === q.subject)?.code,
      section: classes.find((c) => c === q.class),
      group: WORK_GROUPS.find((g) => g.key === q.group)?.key,
      kind: (Object.keys(KINDS) as Kind[]).find((k) => k === q.kind && k !== "skill"),
    },
  };
}

export const anyFilter = (f: WorkFilters) => !!(f.subject || f.section || f.group || f.kind);

/** The tasks the filters leave: of the subject, the class, the group or kind chosen. With a class chosen a topic is marked taught for that
 *  class alone, so its row names that class and counts one. */
export function narrowTasks(tasks: readonly Task[], f: WorkFilters): Task[] {
  const kinds = f.group ? WORK_GROUPS.find((g) => g.key === f.group)!.kinds : null;
  return filterTasks(tasks, { subject: f.subject, section: f.section, kind: f.kind }, null)
    .filter((t) => !kinds || kinds.includes(t.kind))
    .map((t) => (f.section && t.kind === "taught" ? { ...t, sections: [f.section], where: t.where.replace(/ · [^·]*$/, ` · ${f.section}`), many: count(1, "class", "classes") } : t));
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
