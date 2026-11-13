import Link from "@/components/link";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { HeatGrid } from "@/components/heat-grid";
import { Screen } from "@/components/app-frame";
import { StatTiles, type Stat } from "@/components/stat-tile";
import { TaughtNotice } from "@/components/taught-notice";
import type { Session } from "@/lib/auth";
import { schoolToday } from "@/lib/school-clock";
import { dayWords, many } from "@/lib/today";
import { DOORS, open as door, type Door } from "@/lib/today-doors";
import { lateNotes, nextWeekEvents, schoolCounts, schoolNotes } from "@/lib/today-data";
import { heat, readiness, waiting, type School, type Wait } from "@/lib/today-school";
import { anyFilter, approvalsWaiting, myWork, narrowTasks, papersToCheck, waitingRows, workFilters } from "@/lib/today-waiting";
import { WaitingList } from "./waiting-list";
import { CountLine, KnowNote, todayAt, WorkFilterBar, workPanel } from "./waiting-work";

// Today, the school's (page charter B1b, a Dashboard): what the coordinator's day holds and what waits on her. Three tiles, then the
// "waiting on you" list (What needs doing merged in, page charter Part C; its old address answers 308 here): one filter row, how much waits,
// one compact row per kind of work, each with its one action, and the row itself opens on the right with the tasks behind it
// (./waiting-work.tsx). With nothing chosen the right side is last week and the week ahead. Every figure is a whole count of rows; no person
// and no class is ranked. A filter narrows the kinds of work to its own; the school's counts are every class's, so they show with none.
const DOOR: Record<Wait["key"], () => Door> = { clash: DOORS.moves, draft: DOORS.draft, late: DOORS.notes, undone: DOORS.staff, materials: DOORS.materials };

export async function SchoolToday({ me, q }: { me: Session; q: Record<string, string | undefined> }) {
  const [today, full, late, work] = await Promise.all([schoolToday(), schoolCounts(me), lateNotes(me), myWork(me)]);
  const tasks = work?.tasks ?? null;
  const { f, classes } = workFilters(q, tasks ?? [], work?.subjects ?? []);
  const s: School | null = full.ok ? full.value : null;
  // the late notes alone when the counts are not given (the route refused): the one school row that can then be known
  const fallback = !s && late ? [{ key: "late" as const, go: "Open the notes", state: "late" as const, what: "Notes left unconfirmed", n: late, many: many(late, "note") }] : [];
  const rows = waitingRows(anyFilter(f) ? [] : s ? waiting(s) : fallback, (w) => door(DOOR[w.key]()), narrowTasks(tasks ?? [], f));
  const unread = !s && late === null ? await schoolNotes(me) : null;
  const chosen = parseOpen(q.open);
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
      panel={<DetailPanel open={row ? workPanel(row, { q, tab: q.tab, page: Math.max(1, Number(q.page) || 1), closeHref: todayAt(q) }) : null} summary={summary} />}
    >
      <TaughtNotice q={q} />
      {stats.length ? <StatTiles label="The school today in numbers" stats={stats} /> : null}
      {tasks ? null : <p className="b-muted" data-unread="tasks">The papers and approvals could not be read just now.</p>}
      <section className="mt-[var(--space-4)] grid gap-[var(--space-2)]" aria-labelledby="waiting-h">
        <h2 id="waiting-h" className="text-[length:var(--text-title-small)] font-semibold">Waiting on you</h2>
        {tasks ? <WorkFilterBar q={q} f={f} classes={classes} subjects={work?.subjects ?? []} /> : null}
        {tasks ? <CountLine tasks={tasks} /> : null}
        {unread && !unread.ok ? <EmptyState>{unread.down ? `What waits on you could not be read just now. ${unread.words}` : unread.words}</EmptyState> : rows.length ? <WaitingList rows={rows} open={row?.key} at={(k) => todayAt(q, { open: `wait:${k}` })} /> : <EmptyState>Nothing waits on you{anyFilter(f) ? " under these choices" : ""}.</EmptyState>}
        {work ? <KnowNote me={me} f={f} subjects={work.subjects} /> : null}
      </section>
    </Screen>
  );
}

