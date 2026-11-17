import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { TaughtNotice } from "@/components/taught-notice";
import { requireStaff } from "@/lib/auth";
import { isDay } from "@/lib/educator/period";
import { addDays, dateWords, doneCards, lanes, narrowDone, periodOf, waitingCards, windowOf } from "@/lib/my-day";
import { finishedIn } from "@/lib/my-day-done";
import { grades } from "@/lib/queries";
import { schoolToday } from "@/lib/school-clock";
import { subjectLooks } from "@/lib/subject-looks";
import { dayWords, many } from "@/lib/today";
import { myLessons, schoolCounts, schoolVersion, todayBadge } from "@/lib/today-data";
import { DOORS, open as door, type Door } from "@/lib/today-doors";
import { waiting, type Wait } from "@/lib/today-school";
import { anyFilter, myWork, narrowTasks, waitingRows, workFilters, WORK_GROUPS } from "@/lib/today-waiting";
import { MyBoard } from "./my-day-board";
import { DaySwitch } from "./my-day-switch";
import { MyLessons } from "./my-day-lessons";
import { KnowNote, todayAt, workPanel } from "./waiting-work";

// My day (CP-69, specs/CP-69/spec.md; the page that was Today, one address `/my-day`, the old `/my-day` answers 308 here with its query).
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
  const [lessons, work, looks, names, counts, notes] = await Promise.all([myLessons(me, day), myWork(me), subjectLooks(), grades(), school ? schoolCounts(me) : null, todayBadge(me)]);
  const tasks = work?.tasks ?? null;
  const { f, classes } = workFilters(q, tasks ?? [], work?.subjects ?? []);
  const kinds = f.kind ? [f.kind] : f.group ? WORK_GROUPS.find((g) => g.key === f.group)!.kinds : null;
  // the school's own counts show with no filter chosen, as every class's
  const schoolRows = anyFilter(f) || !counts?.ok ? [] : waiting(counts.value);
  const cards = waitingCards(narrowTasks(tasks ?? [], f), schoolRows, (w) => door(DOOR[w.key]()), (k) => todayAt(q, { open: `wait:${k}` }));
  const finished = await finishedIn(me, windowOf(day, period), school).catch(() => []);
  const board = lanes(cards, doneCards(narrowDone(finished, { section: f.section, kinds: kinds ?? undefined })));
  const chosen = parseOpen(q.open);
  // a card opens its own kind and class; an address that names a whole group of work (`wait:group-answers`: the links in lib/todo.ts, old bookmarks) opens that group
  const row = chosen?.kind === "wait" ? (cards.find((c) => c.row.key === chosen.id)?.row ?? waitingRows([], () => null, narrowTasks(tasks ?? [], f)).find((r) => r.key === chosen.id)) : undefined;
  const lessonOpen = chosen?.kind === "lesson" ? chosen.id : null;
  const list = lessons.ok ? lessons.value.lessons : [];
  const scope = lessons.ok ? lessons.value.scope : "mine";
  const waitingCount = cards.length;
  const stage = [dayWords(day), scope === "school" || school ? "every class" : ""].filter(Boolean).join(" · ");
  return (
    <Screen
      stage={stage}
      title="My day"
      purpose="Your lessons and what to prepare, then your tasks."
      action={<DaySwitch words={dateWords(day)} prev={todayAt(q, { day: addDays(day, -1), open: undefined })} next={todayAt(q, { day: addDays(day, 1), open: undefined })} today={todayAt(q, { day: undefined, open: undefined })} isToday={day === today} at={todayAt(q, { day: undefined, open: undefined })} day={day} />}
      next={null}
      panel={
        <DetailPanel
          open={row ? workPanel(row, { q, tab: q.tab, page: Math.max(1, Number(q.page) || 1), closeHref: todayAt(q) }) : null}
          summary={{ title: "My day", stats: [{ id: "lessons", n: list.length, line: list.length === 1 ? "lesson" : "lessons" }, { id: "waiting", n: waitingCount, line: "waiting on you" }, { id: "done", n: board[3].count, line: "finished" }, { id: "notes", n: notes, line: "notes to confirm" }] }}
        />
      }
    >
      <TaughtNotice q={q} />
      {!lessons.ok ? <EmptyState>{lessons.down ? `Your lessons could not be read just now. ${lessons.words}` : lessons.words}</EmptyState> : null}
      {lessons.ok ? (
        <section className="grid gap-[var(--space-2)]" aria-label={`Lessons on ${dayWords(day)}`}>
          {lessons.value.note && !list.length ? <p className="font-semibold" data-day-note>{lessons.value.note}</p> : null}
          <MyLessons me={me} lessons={list} scope={scope} open={lessonOpen} q={{ ...q, day }} looks={looks} gradeName={names.name} />
          {list.length ? <p className="b-muted" data-teach-line>{many(list.length, "lesson")}</p> : null}
        </section>
      ) : null}
      {tasks ? <MyBoard lanes={board} q={q} day={day} period={period} f={f} classes={classes} subjects={work?.subjects ?? []} /> : <p className="b-muted" data-unread="tasks">What waits on you could not be read just now.</p>}
      {tasks ? <KnowNote me={me} f={f} subjects={work?.subjects ?? []} /> : null}
    </Screen>
  );
}
