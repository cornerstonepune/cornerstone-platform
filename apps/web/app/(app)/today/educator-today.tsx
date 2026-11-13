import Link from "@/components/link";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { SUBJECT } from "@/components/fortnight-grid";
import { lessonPanel } from "@/components/lesson-panel";
import { PeriodRow } from "@/components/period-row";
import { Screen } from "@/components/app-frame";
import { StatTiles, type Stat } from "@/components/stat-tile";
import { TaughtNotice } from "@/components/taught-notice";
import type { Session } from "@/lib/auth";
import { blankWords, isBlank, isLesson } from "@/lib/educator/period";
import type { Day, Period } from "@/lib/educator/types";
import { E } from "@/lib/educator/words";
import { lessonView } from "@/lib/lesson-view";
import { nowAtSchool, schoolToday } from "@/lib/school-clock";
import { subjectLook, subjectLooks } from "@/lib/subject-looks";
import { dayMarks, dayWords, fortnightWords, lessonRow } from "@/lib/today";
import { myDay, myNotes, nextLessonDay, noteFigures, sessionsOf, type Read } from "@/lib/today-data";
import { DOORS, open as door } from "@/lib/today-doors";
import { myWork, narrowTasks, papersToCheck, waitingRows, workFilters, anyFilter } from "@/lib/today-waiting";
import { classWords } from "@/lib/voice-types";
import { WaitingList } from "./waiting-list";
import { CountLine, KnowNote, todayAt, WorkFilterBar, workPanel } from "./waiting-work";

// Today, the educator's (page charter B1, a Workspace): three tiles (lessons today, notes to confirm, papers to check), then the day's
// lessons as a timeline of subject-coloured blocks, each saying done, now or next. A block opens the lesson on the right, in the lesson's
// own panel (components/lesson-panel.tsx, as the timetable opens it); with none named the panel opens on the lesson now, else the next.
// A day with no lesson says why in the school's words and shows the next school day's lessons. Under the day, what waits on her (What needs
// doing, merged into Today: page charter Part C, ./waiting-work.tsx): one filter row, how much waits, a row per kind of work, a row opening on
// the right (`open=wait:<key>`) with its tasks. Whole counts only, no score, no rank.
const addr = (o: Record<string, string | undefined>) => {
  const q = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString();
  return q ? `/today?${q}` : "/today";
};

/** The day whose lessons are shown: the day asked for, or, when it has no lesson, the next school day after it that has one (and when lessons start again). */
async function shownDay(me: Session, got: Read<Day>, today: string): Promise<{ day: Day | null; why: string | null }> {
  if (!got.ok) return { day: null, why: null };
  const d = got.value;
  if (!isBlank(d) && d.periods.some(isLesson)) return { day: d, why: null };
  const why = `${d.day === today ? "No sessions today." : "No sessions on this day."} ${blankWords(d)}`;
  const after = await nextLessonDay(me, d);
  if (!after) return { day: null, why };
  const starts = after.fortnight !== null ? E.dayKind.nextFortnight.replace("{n}", String(after.fortnight)).replace("{day}", dayWords(after.day)) : `The next school day is ${dayWords(after.day)}.`;
  const next = await myDay(me, after.day);
  return { day: next.ok && next.value.periods.some(isLesson) ? next.value : null, why: `${why} ${starts}` };
}

export async function EducatorToday({ me, day: asked, q }: { me: Session; day?: string; q: Record<string, string | undefined> }) {
  const { tab } = q;
  const [today, now, got, notes, work, looks] = await Promise.all([schoolToday(), nowAtSchool(), myDay(me, asked), myNotes(me), myWork(me), subjectLooks()]);
  const tasks = work?.tasks ?? null;
  const { f, classes } = workFilters(q, tasks ?? [], work?.subjects ?? []);
  const waits = waitingRows([], () => null, narrowTasks(tasks ?? [], f));
  const wanted = parseOpen(q.open);
  const waitRow = wanted?.kind === "wait" ? waits.find((r) => r.key === wanted.id) : undefined;
  // a row that waits, opened on the right, takes the lesson's place there
  const open = waitRow ? "none" : q.open;
  const { day, why } = await shownDay(me, got, today);
  const lessons = day ? day.periods.filter(isLesson) : [];
  const sessions = day ? await sessionsOf(day.class.id, day.day) : {};
  const { marks, chosen } = dayMarks(lessons, now, !day ? "today" : day.day < today ? "past" : day.day > today ? "future" : "today");
  // the lesson open on the right: the one the address names, none when it says "none", else the one now or next
  const named = open?.startsWith("lesson:") ? open.slice("lesson:".length) : null;
  const session = open === "none" ? null : (named && Object.values(sessions).includes(named) ? named : chosen ? sessions[chosen] : null) ?? null;
  const keep = { day: asked, subject: q.subject, class: q.class, group: q.group };
  const rows = lessons.map((p: Period) => {
    const id = sessions[p.period_id];
    const look = subjectLook(looks, p.subject);
    const href = id ? addr({ ...keep, open: `lesson:${id}` }) : (door(DOORS.period(p.period_id, day!.class.id, day!.day)) ?? "#");
    return lessonRow(p, look, SUBJECT[look], marks[p.period_id], href, id ? { key: `lesson:${id}`, selected: id === session } : undefined);
  });
  const v = session ? await lessonView(me, session) : null;
  const panel = v ? todayPanel(lessonPanel(v, { key: `lesson:${session}`, closeHref: addr({ ...keep, open: "none" }), tab }), session!, !!v.a, session !== named) : null;
  const figures = noteFigures(notes);
  const first = lessons.find((p) => marks[p.period_id] === "now") ?? lessons.find((p) => marks[p.period_id] === "next");
  const firstSession = first ? sessions[first.period_id] : undefined;
  const stats: Stat[] = [
    ...(day ? [{ id: "lessons", n: lessons.length, line: day.day === today ? "lessons today" : `lessons on ${dayWords(day.day)}`, href: door(DOORS.timetable()) ? `${door(DOORS.timetable())}?view=day&day=${day.day}` : undefined }] : []),
    ...(figures ? [{ id: "notes", n: figures.late + figures.soon, line: "notes to confirm", tone: figures.late ? ("act" as const) : figures.soon ? ("wait" as const) : undefined, href: door(DOORS.notes()) ?? undefined }] : []),
    ...(tasks ? [{ id: "papers", n: papersToCheck(tasks), line: "papers to check", tone: papersToCheck(tasks) ? ("wait" as const) : undefined, href: "/children/assessments?status=check" }] : []),
  ];
  const cls = day ? classWords(day.class) : got.ok ? classWords(got.value.class) : "";
  const stage = [dayWords(asked ?? today), cls, day && day.day === (asked ?? today) ? fortnightWords(day.fortnight, day.week) : ""].filter(Boolean).join(" · ");
  return (
    <Screen
      stage={stage}
      title="Today"
      purpose="Your lessons in order. Choose one to see what to teach, how and what to lay out; mark the class on the lesson."
      action={firstSession ? <Link href={`/period/${firstSession}`} className="btn" data-next-lesson>Open my next lesson</Link> : <p className="font-medium">{lessons.length ? "No lesson is left today." : "No lesson to open today."}</p>}
      next={{ href: door(DOORS.timetable()) ?? "/timetable", label: "Timetable" }}
      panel={waitRow ? <DetailPanel open={workPanel(waitRow, { q, tab, page: Math.max(1, Number(q.page) || 1), closeHref: todayAt(q) })} summary={{ title: "", stats: [] }} /> : panel ?? (lessons.length ? <DetailPanel summary={{ title: "Your day", stats: [{ id: "done", n: lessons.filter((p) => marks[p.period_id] === "done").length, line: "taught" }, { id: "left", n: lessons.filter((p) => marks[p.period_id] !== "done").length, line: "still to teach" }], after: <p className="b-label b-muted">Choose a lesson to see it here.</p> }} /> : undefined)}
    >
      <TaughtNotice q={q} />
      {stats.length ? <StatTiles label="Your day in numbers" stats={stats} /> : null}
      {notes.ok || !notes.down ? null : <p className="b-muted" data-unread="notes">Your notes could not be read just now. {notes.words}</p>}
      {tasks ? null : <p className="b-muted" data-unread="papers">Your papers could not be read just now.</p>}
      <div className="mt-[var(--space-4)] grid gap-[var(--space-3)]">
        {!got.ok ? <EmptyState>{got.down ? `Your day could not be read just now. ${got.words}` : got.words}</EmptyState> : null}
        {why ? <p data-day-note className="font-medium">{why}</p> : null}
        {rows.length ? <PeriodRow tinted label={day && (day.day !== today || (asked ?? today) !== today) ? `Lessons on ${dayWords(day.day)}` : "Today's lessons"} periods={rows} /> : got.ok && !why ? <EmptyState>No lesson is planned for this day.</EmptyState> : null}
      </div>
      {work ? (
        <section className="mt-[var(--space-4)] grid gap-[var(--space-2)]" aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="text-[length:var(--text-title-small)] font-semibold">Waiting on you</h2>
          <WorkFilterBar q={q} f={f} classes={classes} subjects={work.subjects} />
          <CountLine tasks={work.tasks} />
          {waits.length ? <WaitingList rows={waits} open={waitRow?.key} at={(k) => todayAt(q, { open: `wait:${k}` })} /> : <EmptyState>Nothing waits on you{anyFilter(f) ? " under these choices" : ""}.</EmptyState>}
          <KnowNote me={me} f={f} subjects={work.subjects} />
        </section>
      ) : null}
    </Screen>
  );
}

/** The lesson's panel as Today shows it: the lesson's own tabs, the marking itself left to the lesson's page (page charter B4), so the
 *  Children tab says where the class is marked. Opened by default (not by the address) it is drawn in place, never as a sheet over the day. */
function todayPanel(o: Opened, session: string, hasActivity: boolean, inline: boolean) {
  const tabs = o.tabs.map((t) =>
    t.key !== "children"
      ? t
      : {
          ...t,
          body: hasActivity ? (
            <p className="grid gap-[var(--space-2)]" data-part="mark-on-lesson">
              <span>The class is marked child by child on the lesson&apos;s own page.</span>
              <Link href={`/period/${session}`} className="btn secondary w-fit" data-mark-class>
                Mark the class
              </Link>
            </p>
          ) : (
            t.body
          ),
        },
  );
  return <DetailPanel inline={inline} open={{ ...o, tabs }} summary={{ title: "", stats: [] }} />;
}
