import Link from "@/components/link";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { HeatGrid } from "@/components/heat-grid";
import { Screen } from "@/components/app-frame";
import { StatTiles, type Stat } from "@/components/stat-tile";
import type { Kind } from "@/components/kind-tile";
import type { Session } from "@/lib/auth";
import { schoolToday } from "@/lib/school-clock";
import { dayWords, many } from "@/lib/today";
import { DOORS, open as door, type Door } from "@/lib/today-doors";
import { lateNotes, nextWeekEvents, schoolCounts, schoolNotes } from "@/lib/today-data";
import { heat, readiness, waiting, type School, type Wait } from "@/lib/today-school";
import { approvalsWaiting, myTasks, papersToCheck, waitingRows, type WaitRow } from "@/lib/today-waiting";
import { WaitingList } from "./waiting-list";

// Today, the school's (page charter B1b, a Dashboard): what the coordinator's day holds and what waits on her. Three tiles, then the
// "waiting on you" list (What needs doing folded in, page charter Part C): one compact row per kind of work, each with its one action, and
// the row itself opens on the right with the rows behind it. With nothing chosen the right side is last week and the week ahead. Every
// figure is a whole count of rows; no person and no class is ranked.
const DOOR: Record<Wait["key"], () => Door> = { clash: DOORS.moves, draft: DOORS.draft, late: DOORS.notes, undone: DOORS.staff, materials: DOORS.materials };
const KIND: Record<string, Kind> = { "school-clash": "period", "school-draft": "period", "school-undone": "period", "school-late": "note", "school-materials": "activity", "group-record": "note", "group-notes": "note", "group-asks": "skill" };

export async function SchoolToday({ me, open, tab }: { me: Session; open?: string; tab?: string }) {
  const [today, full, late, tasks] = await Promise.all([schoolToday(), schoolCounts(me), lateNotes(me), myTasks(me)]);
  const s: School | null = full.ok ? full.value : null;
  // the late notes alone when the counts are not given (the route refused): the one school row that can then be known
  const fallback = !s && late ? [{ key: "late" as const, go: "Open the notes", state: "late" as const, what: "Notes left unconfirmed", n: late, many: many(late, "note") }] : [];
  const rows = waitingRows(s ? waiting(s) : fallback, (w) => door(DOOR[w.key]()), tasks ?? []);
  const unread = !s && late === null ? await schoolNotes(me) : null;
  const chosen = parseOpen(open);
  const row = chosen?.kind === "wait" ? rows.find((r) => r.key === chosen.id) : undefined;
  const first = rows.find((r) => r.href);
  const stats: Stat[] = [
    ...(late !== null ? [{ id: "late", n: late, line: "notes unconfirmed past their time", tone: late ? ("act" as const) : undefined, href: door(DOORS.notes()) ?? undefined }] : []),
    ...(tasks ? [{ id: "papers", n: papersToCheck(tasks), line: "papers to check", tone: papersToCheck(tasks) ? ("wait" as const) : undefined, href: "/children/assessments?status=check" }] : []),
    ...(tasks ? [{ id: "approvals", n: approvalsWaiting(tasks, s?.drafts.count ?? 0), line: "approvals waiting", tone: approvalsWaiting(tasks, s?.drafts.count ?? 0) ? ("wait" as const) : undefined }] : []),
  ];
  const happening = s ? await nextWeekEvents(s.next_week.from) : [];
  const grid = s ? heat(s.last_week.cells) : null;
  const summary = {
    title: "Last week",
    stats: s ? [{ id: "taught", n: s.last_week.sessions_done, line: `lessons done of ${s.last_week.sessions_planned} planned` }] : [],
    after: (
      <>
        {grid ? <div className="overflow-x-auto" data-part="last-week" tabIndex={0} role="region" aria-label="Last week, class by day"><HeatGrid days={grid.days} rows={grid.rows} empty="No lessons were planned last week." /></div> : null}
        {s ? (
          <section aria-label="Next week" className="grid gap-[var(--space-1)]" data-part="next-week">
            <h3 className="b-label b-muted">Next week</h3>
            {happening.length ? <ul className="grid gap-1">{happening.map((h) => <li key={h.day + h.what}><b>{dayWords(h.day)}</b> · {h.what}</li>)}</ul> : <p className="b-muted">No holiday, changed timing or new fortnight next week.</p>}
            {s.next_week.new_activities.length ? <p>{many(s.next_week.new_activities.length, "new activity", "new activities")}: {s.next_week.new_activities.slice(0, 4).map((a) => a.name).join(", ")}</p> : null}
            <ul className="grid gap-1" aria-label="Does the system have what it needs">
              {readiness(s.ready).map((r) => <li key={r.label}><b className="b-num">{r.have}</b> of <span className="b-num">{r.of}</span> {r.label}</li>)}
            </ul>
          </section>
        ) : null}
        <p className="b-label b-muted">Choose a row to see what waits in it.</p>
      </>
    ),
  };
  return (
    <Screen
      stage={`${dayWords(today)} · every class`}
      title="Today, the school"
      purpose="What waits on you, one row each with its own button. Choose a row to see the work behind it on the right."
      action={first ? <Link href={first.href!} className="btn" data-first-waiting>Open the first: {first.what.toLowerCase()}</Link> : <p className="font-medium">{unread ? "What waits on you could not be read just now." : "Nothing waits on you."}</p>}
      next={{ href: door(DOORS.timetable()) ?? "/timetable", label: "Timetable" }}
      panel={<DetailPanel open={row ? panelOf(row, tab) : null} summary={summary} />}
    >
      {stats.length ? <StatTiles label="The school today in numbers" stats={stats} /> : null}
      {tasks ? null : <p className="b-muted" data-unread="tasks">The papers and approvals could not be read just now.</p>}
      <section className="mt-[var(--space-4)] grid gap-[var(--space-2)]" aria-labelledby="waiting-h">
        <h2 id="waiting-h" className="text-[length:var(--text-title-small)] font-semibold">Waiting on you</h2>
        {unread && !unread.ok ? <EmptyState>{unread.down ? `What waits on you could not be read just now. ${unread.words}` : unread.words}</EmptyState> : rows.length ? <WaitingList rows={rows} open={row?.key} /> : <EmptyState>Nothing waits on you.</EmptyState>}
      </section>
    </Screen>
  );
}

/** A row opened on the right: the rows behind it, each with its own action (as What needs doing listed them), or the school's count in words. */
function panelOf(r: WaitRow, tab?: string): Opened {
  const body = r.tasks.length ? (
    <ul className="grid gap-[var(--space-2)]" data-part="waiting-rows">
      {r.tasks.slice(0, 12).map((t) => (
        <li key={t.id} className="grid gap-[var(--space-1)]">
          <span>{t.where || t.what}{t.many ? <span className="b-muted"> · {t.many}</span> : null}</span>
          <Link href={t.href} className="btn secondary w-fit" data-panel-task>{t.action}</Link>
        </li>
      ))}
      {r.tasks.length > 12 ? <li className="b-muted">{many(r.tasks.length - 12, "more row")} on its page.</li> : null}
    </ul>
  ) : (
    <p>{r.many}: {r.what.toLowerCase()}.</p>
  );
  return { key: `wait:${r.key}`, kind: KIND[r.key] ?? "assessment", title: r.what, line: r.many, closeHref: "/today", full: r.home ?? undefined, tab, tabs: [{ key: "waiting", label: "What waits", body }] };
}
