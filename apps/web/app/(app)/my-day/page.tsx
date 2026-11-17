import Link from "@/components/link";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { TaughtNotice } from "@/components/taught-notice";
import { ViewToggle } from "@/components/kanban-board";
import { requireStaff } from "@/lib/auth";
import { isDay } from "@/lib/educator/period";
import { dayChoices, doneCards, lanes, narrowDone, periodOf, waitingCards, windowOf } from "@/lib/my-day";
import { finishedIn } from "@/lib/my-day-done";
import { grades } from "@/lib/queries";
import { schoolToday } from "@/lib/school-clock";
import { subjectLooks } from "@/lib/subject-looks";
import { dayWords, many } from "@/lib/today";
import { myLessons, schoolCounts, schoolVersion } from "@/lib/today-data";
import { DOORS, open as door, type Door } from "@/lib/today-doors";
import { waiting, type Wait } from "@/lib/today-school";
import { anyFilter, myWork, narrowTasks, workFilters, WORK_GROUPS } from "@/lib/today-waiting";
import { MyBoard } from "./my-day-board";
import { MyLessons } from "./my-day-lessons";
import { todayAt, workPanel } from "./waiting-work";

// My day (CP-69, specs/CP-69/spec.md; the page that was Today, one address `/my-day`, the old `/today` answers 308 here with its query).
// Two parts for any chosen day: my lessons (a strip in subject colours, each opening in place to what to prepare) and my tasks (a board by
// urgency, with Done for the period chosen). The day, the period and every filter are in the address, so a link says what it shows.
const DOOR: Record<Wait["key"], () => Door> = { clash: DOORS.moves, draft: DOORS.draft, late: DOORS.notes, undone: DOORS.staff, materials: DOORS.materials };

export default async function MyDay({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const today = await schoolToday();
  // a day in the address that is not a date is no day: the page opens on today rather than on "not found"
  const day = isDay(q.day) ? q.day : today;
  const period = periodOf(q.period);
  const school = await schoolVersion(me);
  const [lessons, work, looks, names, counts] = await Promise.all([myLessons(me, day), myWork(me), subjectLooks(), grades(), school ? schoolCounts(me) : null]);
  const tasks = work?.tasks ?? null;
  const { f, classes } = workFilters(q, tasks ?? [], work?.subjects ?? []);
  const kinds = f.kind ? [f.kind] : f.group ? WORK_GROUPS.find((g) => g.key === f.group)!.kinds : null;
  // the school's own counts show with no filter chosen, as every class's
  const schoolRows = anyFilter(f) || !counts?.ok ? [] : waiting(counts.value);
  const cards = waitingCards(narrowTasks(tasks ?? [], f), schoolRows, (w) => door(DOOR[w.key]()), (k) => todayAt(q, { open: `wait:${k}` }));
  const finished = await finishedIn(me, windowOf(day, period), school).catch(() => []);
  const board = lanes(cards, doneCards(narrowDone(finished, { section: f.section, kinds: kinds ?? undefined })));
  const chosen = parseOpen(q.open);
  const row = chosen?.kind === "wait" ? cards.find((c) => c.row.key === chosen.id)?.row : undefined;
  const lessonOpen = chosen?.kind === "lesson" ? chosen.id : null;
  const list = lessons.ok ? lessons.value.lessons : [];
  const scope = lessons.ok ? lessons.value.scope : "mine";
  const waitingCount = cards.length;
  const first = list[0];
  const switcher = dayChoices(today, day);
  const stage = [dayWords(day), scope === "school" || school ? "every class" : ""].filter(Boolean).join(" · ");
  return (
    <Screen
      stage={stage}
      title="My day"
      purpose="Your lessons and what to prepare, then what waits on you."
      action={first ? <Link href={`/period/${first.session_id}`} className="btn" data-next-lesson>Open the first lesson</Link> : <p className="font-semibold">No lesson to open on this day.</p>}
      next={null}
      panel={
        <DetailPanel
          open={row ? workPanel(row, { q, tab: q.tab, page: Math.max(1, Number(q.page) || 1), closeHref: todayAt(q) }) : null}
          summary={{ title: "My day", stats: [{ id: "lessons", n: list.length, line: list.length === 1 ? "lesson" : "lessons" }, { id: "waiting", n: waitingCount, line: "waiting on you" }, { id: "done", n: board[3].count, line: "finished" }] }}
        />
      }
    >
      <TaughtNotice q={q} />
      <nav className="flex flex-wrap items-center gap-[var(--space-2)]" data-day-switch aria-label="Day">
        <ViewToggle current={switcher.find((s) => s.day === day)?.key ?? ""} views={switcher.map((s) => ({ key: s.key, label: s.label, icon: "today" as const, href: todayAt(q, { day: s.day, open: undefined }) }))} />
        <form action="/my-day" method="get" className="flex items-center gap-[var(--space-2)]">
          {(["period", "subject", "class", "group", "kind"] as const).map((k) => (q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null))}
          <label className="b-label b-muted" htmlFor="my-day-date">Pick a day</label>
          <input id="my-day-date" type="date" name="day" defaultValue={day} className="input" />
          <button type="submit" className="btn secondary">Show</button>
        </form>
      </nav>
      {!lessons.ok ? <EmptyState>{lessons.down ? `Your lessons could not be read just now. ${lessons.words}` : lessons.words}</EmptyState> : null}
      {lessons.ok ? (
        <section className="grid gap-[var(--space-2)]" aria-label={`Lessons on ${dayWords(day)}`}>
          {lessons.value.note && !list.length ? <p className="font-semibold" data-day-note>{lessons.value.note}</p> : null}
          <MyLessons me={me} lessons={list} scope={scope} open={lessonOpen} q={{ ...q, day }} looks={looks} gradeName={names.name} />
          {list.length ? <p className="b-muted" data-teach-line>{many(list.length, "lesson")}</p> : null}
        </section>
      ) : null}
      {tasks ? <MyBoard lanes={board} q={q} day={day} period={period} f={f} classes={classes} subjects={work?.subjects ?? []} /> : <p className="b-muted" data-unread="tasks">What waits on you could not be read just now.</p>}
    </Screen>
  );
}
