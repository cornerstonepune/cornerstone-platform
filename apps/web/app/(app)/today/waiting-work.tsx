import Link from "@/components/link";
import { Count } from "@/components/count";
import { DataTable } from "@/components/data-table";
import type { Opened } from "@/components/detail-panel";
import { FilterBar } from "@/components/filter-bar";
import type { Kind as PanelKind } from "@/components/kind-tile";
import { StatusChip } from "@/components/status-chip";
import type { Session } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { noteLines, weekNote } from "@/lib/queries-week-note";
import { workScope } from "@/lib/reach";
import { schoolWeek } from "@/lib/school-clock";
import { isMine } from "@/lib/scope";
import { waitingCount, type Task } from "@/lib/todo";
import { WORK_GROUPS, type WaitRow, type WorkFilters } from "@/lib/today-waiting";
import type { Column } from "@/lib/ux-rules";
import { weekWords } from "@/lib/week";
import { switchTopic } from "../topic-actions";

// The work behind Today's "waiting on you" rows (page charter Part C: What needs doing merged into Today). What the old What needs doing
// page did, on Today: one filter row (subject, class, what), the count of what waits, a row opened on the right as its own table of tasks
// (each with its one action; a topic marked taught in its row, for the class it names), paged by ten, and, folded under the list, what the
// system now knows this week. Both Todays carry it: the coordinator's under its tiles, the educator's under the day's lessons.
type Q = Record<string, string | undefined>;
const KEEP = ["subject", "class", "group", "kind"] as const;

/** Today's address with the filters kept and `change` applied (undefined removes a parameter). */
export function todayAt(q: Q, change: Q = {}): string {
  const p = new URLSearchParams();
  for (const k of [...KEEP, "day"]) if (q[k]) p.set(k, q[k]!);
  for (const [k, v] of Object.entries(change)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const s = p.toString();
  return s ? `/today?${s}` : "/today";
}

/** The one filter row: Subject (with more than one), Class (with work in more than one), What (the kinds of work, skills aside). */
export function WorkFilterBar({ q, f, classes, subjects }: { q: Q; f: WorkFilters; classes: readonly string[]; subjects: readonly { code: string; label: string }[] }) {
  return (
    <FilterBar
      action="/today"
      keep={{ day: q.day }}
      filters={[
        ...(subjects.length > 1 ? [{ name: "subject", label: "Subject", value: f.subject, all: "Every subject", options: subjects.map((s) => [s.code, s.label] as const) }] : []),
        ...(classes.length > 1 ? [{ name: "class", label: "Class", value: f.section, all: "Every class", options: classes.map((c) => [c, c] as const) }] : []),
        { name: "group", label: "What", value: f.group, all: "Everything", options: WORK_GROUPS.map((g) => [g.key, g.title] as const) },
      ]}
    />
  );
}

/** How much waits: what is to do now or this week, and what can wait until ready, never the filters' narrowing of it. */
export function CountLine({ tasks }: { tasks: readonly Task[] }) {
  const waiting = waitingCount(tasks);
  return (
    <p className="b-label" data-todo={waiting}>
      <Count of="What needs doing" n={waiting} /> to do{tasks.length > waiting ? ` · ${tasks.length - waiting} when ready` : ""}
    </p>
  );
}

/** A task's one action: a link that opens that one item; a topic is marked taught in the row itself, for the class it names. */
function RowAction({ t }: { t: Task }) {
  if (t.kind !== "taught")
    return (
      <Link href={t.href} className="btn secondary whitespace-nowrap" data-action={t.kind} data-panel-task="">
        {t.action}
      </Link>
    );
  return (
    <form action={switchTopic} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="code" value={t.id.slice("taught:".length)} />
      <input type="hidden" name="taught" value="on" />
      {t.sections.length > 1 ? (
        <select name="class" aria-label={`Class taught ${t.topicName}`} className="select min-h-[36px] !w-auto">
          {t.sections.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="class" value={t.sections[0]} />
      )}
      <button className="btn secondary whitespace-nowrap" type="submit" data-action={t.kind} data-panel-task="">
        {t.action}
      </button>
    </form>
  );
}

const columns = (mixed: boolean): Column<Task>[] => [
  { key: "priority", label: "Priority", status: true, width: "8rem", keep: true, value: (t) => t.state, cell: (t) => <StatusChip state={t.state} round={t.kind === "note" || t.kind === "record"} /> },
  ...(mixed ? [{ key: "what", label: "What", width: "11rem", value: (t: Task) => t.what }] : []),
  { key: "where", label: "Where", value: (t) => t.where },
  { key: "many", label: "How many", width: "7rem", value: (t) => t.many },
  { key: "action", label: "", width: "12rem", keep: true, value: (t) => t.action, cell: (t) => <RowAction t={t} /> },
];

const KIND: Record<string, PanelKind> = { "school-clash": "period", "school-draft": "period", "school-undone": "period", "school-late": "note", "school-materials": "activity", "group-record": "note", "group-notes": "note", "group-asks": "skill", "group-taught": "objective" };

/** A row opened on the right: the tasks behind it, each with its own action, ten to a page; or, for one of the school's counts, the count in
 *  words. "Open full page" is the page that does that kind of work. */
export function workPanel(r: WaitRow, o: { q: Q; tab?: string; page: number; closeHref: string }): Opened {
  const mixed = new Set(r.tasks.map((t) => t.kind)).size > 1;
  const body = r.tasks.length ? (
    <div className="min-w-0" data-part="waiting-rows">
      <DataTable
        label={r.what}
        columns={columns(mixed)}
        rows={r.tasks}
        rowKey={(t) => t.id}
        extras={{ attrs: (t) => ({ "data-kind": t.kind, "data-state": t.state, "data-shows": t.shows }) }}
        more={{ page: o.page, href: (n: number) => todayAt(o.q, { open: `wait:${r.key}`, page: n > 1 ? String(n) : undefined }) }}
      />
    </div>
  ) : (
    <p>
      {r.many}: {r.what.toLowerCase()}.
    </p>
  );
  return { key: `wait:${r.key}`, kind: KIND[r.key] ?? "assessment", title: r.what, line: r.many, closeHref: o.closeHref, full: r.home ?? undefined, tab: o.tab, tabs: [{ key: "waiting", label: "What waits", body }] };
}

/** What the system now knows this week, in five lines, folded under the list: for the class chosen in the filter, else every class the
 *  person sees, in the subject chosen, else their first. */
export async function KnowNote({ me, f, subjects }: { me: Session; f: WorkFilters; subjects: readonly { code: string; label: string }[] }) {
  const subject = f.subject ?? subjects[0]?.code ?? "";
  const [scope, week] = await Promise.all([workScope(me), schoolWeek()]);
  const known = await deadline(weekNote(f.section && isMine(scope, f.section) ? { classes: [f.section], note: null } : scope, subject)).catch(() => null);
  if (!known) return null;
  return (
    <details className="b-card" data-know>
      <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">What the system now knows</summary>
      <p className="b-label b-muted">
        {subjects.find((s) => s.code === subject)?.label ?? "Every subject"}, {weekWords(week)}, in the classes you see
      </p>
      <ol className="mt-2 grid list-decimal gap-1 pl-5">
        {noteLines(known).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ol>
    </details>
  );
}
