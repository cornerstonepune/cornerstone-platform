import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { ViewToggle } from "@/components/kanban-board";
import { StatusChip } from "@/components/status-chip";
import { SubjectTag } from "@/components/subject-tag";
import { SubjectDonut, WeekBars, type Part } from "@/components/subject-weeks";
import { requireStaff } from "@/lib/auth";
import { weekOrNull } from "@/lib/educator/data";
import { grades } from "@/lib/queries";
import { subjectLook, subjectLooks } from "@/lib/subject-looks";
import { chipOf, datesOf, firstGradeTaught, lessonsOf, parseChoice, RANGES, rangeOf, timeBySubject, type Chosen, type ClassRef, type SubjectTime } from "@/lib/time-by-subject";
import { isCoordinator } from "@/lib/timetable-ui";
import type { Column } from "@/lib/ux-rules";
import { schoolToday } from "@/lib/voice-page";
import { classWords } from "@/lib/voice-types";
import { dateWords } from "@/lib/week";
import "./time.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable/time";
/** "06-Jul": a week said by its Monday. */
const dayMonth = (d: string) => dateWords(d).slice(0, 6);

// Time by subject (docs/frontend/page-charter.md B3), a Dashboard: how much teaching time the class gives each subject, and whether it
// matches what the school intends. Every number is the engine's (/timetable/time); the target is the timetable rules' share, and a subject
// the rules give no time has none, so no chip. A part of a week's column opens that week's lessons of that subject on the right (A2).
export default async function TimeBySubjectPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const today = await schoolToday();
  const range = rangeOf(q.range);
  const dates = datesOf(range.weeks, today);
  const chosen: Chosen | null = parseChoice(q.class) ?? (await openingChoice(me, coordinator, dates));
  const data = chosen ? await timeBySubject(me, chosen, dates) : null;
  const at = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ range: q.range, class: q.class, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${HERE}?${s}` : HERE;
  };
  const toggle = (
    <span data-ux="action" data-range-chooser>
      <ViewToggle current={range.key} views={RANGES.map((r) => ({ key: r.key, label: r.label, icon: r.icon, href: at({ range: r.key, open: undefined }) }))} />
    </span>
  );
  const purpose = "How much teaching time each subject gets, beside what the timetable rules intend.";
  if (!data) {
    return (
      <Screen stage="Timetable" title="Time by subject" purpose={purpose} panel={<DetailPanel summary={{ title: "This range", stats: [] }} />}>
        <div className="tt-filters" data-from={dates.start} data-to={dates.end}>{toggle}</div>
        <EmptyState>
          <span data-no-time>{chosen ? "Your class's timetable is not open to you yet." : "No class has lessons in these days."}</span>
        </EmptyState>
      </Screen>
    );
  }

  const looks = await subjectLooks();
  const gradeName = (await grades()).name;
  const words = (c: ClassRef) => classWords({ ...c, gradeName: gradeName(c.grade) });
  const value = "class_id" in chosen! ? chosen.class_id : `all:${chosen!.grade}`;
  const allOf = coordinator ? [...new Set(data.may_read.map((c) => c.grade))].map((g) => [`all:${g}`, `All ${gradeName(g)}`] as const) : [];
  const options = [...allOf, ...data.may_read.map((c) => [c.id, words(c)] as const)];
  const order = data.subjects.map((s) => s.subject);
  const part = (code: string, minutes: number): Part => ({ code, minutes, look: subjectLook(looks, code), words: data.subjects.find((s) => s.subject === code)?.label ?? code });
  const weeks = data.weeks.map((w) => ({
    week: w.week_start,
    label: dayMonth(w.week_start),
    parts: [...w.subjects].sort((a, b) => order.indexOf(a.subject_code) - order.indexOf(b.subject_code)).map((s) => part(s.subject_code, s.minutes)),
  }));
  const taught = data.subjects.filter((s) => s.minutes > 0);
  const counts = { within: 0, off: 0 };
  for (const s of data.subjects) if (s.status === "within") counts.within++;
  else if (s.status === "over" || s.status === "short") counts.off++;

  const opened = parseOpen(q.open);
  const [week, code] = opened?.kind === "period" ? opened.id.split("~") : [];
  const open = week && code && data.weeks.some((w) => w.week_start === week) ? await lessonPanel(data, week, code, part(code, 0).words, dates, words, at({ open: undefined })) : null;

  const columns: Column<SubjectTime>[] = [
    { key: "subject", label: "Subject", value: (r) => r.label, cell: (r) => <SubjectTag look={subjectLook(looks, r.subject)} words={r.label} /> },
    { key: "minutes", label: "Minutes", value: (r) => r.minutes, num: true, width: "5rem" },
    { key: "share", label: "% of teaching time", value: (r) => r.share_pct, num: true, width: "7rem", cell: (r) => `${r.share_pct}%` },
    { key: "target", label: "The school's target", width: "7rem", value: (r) => (r.target_share_pct === null ? "No target" : r.target_share_pct), num: true, cell: (r) => (r.target_share_pct === null ? <span className="b-muted">No target</span> : `${r.target_share_pct}%`) },
    {
      key: "against",
      label: "Against the target",
      status: true,
      width: "7.5rem",
      value: (r) => chipOf(r.status)?.words ?? "",
      cell: (r) => {
        const c = chipOf(r.status);
        return c ? <StatusChip state={c.state} words={c.words} compact round /> : <span className="b-muted">–</span>;
      },
    },
  ];
  const classLine = "class_id" in chosen! ? words(data.read[0]) : `All ${gradeName(chosen!.grade)} (${data.read.length} ${data.read.length === 1 ? "class" : "classes"})`;

  return (
    <Screen
      stage={`${classLine} · ${dateWords(dates.start)} to ${dateWords(dates.end)}`}
      title="Time by subject"
      purpose={purpose}
      panel={
        <DetailPanel
          open={open}
          summary={{
            title: `This ${range.label.toLowerCase()}`,
            stats: [
              { id: "minutes", n: data.total_minutes, line: "minutes taught" },
              { id: "subjects", n: taught.length, line: taught.length === 1 ? "subject" : "subjects" },
              { id: "within", n: counts.within, line: "within the target", tone: counts.within ? "ok" : undefined },
              { id: "off", n: counts.off, line: "over or short", tone: counts.off ? "act" : undefined },
            ],
            after: <p className="b-label b-muted">Choose a part of a week&apos;s column to see those lessons here.</p>,
          }}
        />
      }
    >
      <div className="tt-filters" data-from={dates.start} data-to={dates.end}>
        {toggle}
        <FilterBar action={HERE} keep={{ range: q.range }} filters={[{ name: "class", label: "Class", value, required: true, all: "", options }]} />
      </div>
      {data.total_minutes ? (
        <>
          <div className="ts-charts">
            <WeekBars weeks={weeks} href={(w, c) => at({ open: `period:${w}~${c}` })} open={open ? `${week}~${code}` : undefined} />
            <SubjectDonut total={data.total_minutes} parts={taught.map((s) => ({ ...part(s.subject, s.minutes), share: s.share_pct }))} />
          </div>
          <DataTable label="Time by subject" columns={columns} rows={data.subjects} rowKey={(r) => r.subject} limit={data.subjects.length} more={{ page: 1, href: () => "#" }} extras={{ attrs: (r) => ({ "data-subject-time": r.subject }) }} />
        </>
      ) : (
        <EmptyState>
          <span data-no-lessons>No lessons in these days for {classLine}.</span>
        </EmptyState>
      )}
    </Screen>
  );
}

/** The class the page opens on when none is chosen: a coordinator, every class of the first grade taught in the range; anyone else, the
 *  first class she holds (the engine's own list, /timetable/week). None when there is nothing to open on. */
async function openingChoice(me: { email: string }, coordinator: boolean, dates: { start: string; end: string }): Promise<Chosen | null> {
  if (coordinator) {
    const grade = await firstGradeTaught(dates);
    return grade ? { grade } : null;
  }
  const week = await weekOrNull(me, { week_of: dates.end });
  return week ? { class_id: week.class.id } : null;
}

/** One week's lessons of one subject, for the panel: each a link to the lesson, with its day, time and class. */
async function lessonPanel(
  data: { read: ClassRef[]; weeks: { week_start: string; subjects: { subject_code: string; minutes: number }[] }[] },
  week: string,
  code: string,
  label: string,
  dates: { start: string; end: string },
  words: (c: ClassRef) => string,
  closeHref: string,
): Promise<Opened> {
  const lessons = await lessonsOf(data.read.map((c) => c.id), week, code, dates);
  const minutes = data.weeks.find((w) => w.week_start === week)?.subjects.find((s) => s.subject_code === code)?.minutes ?? 0;
  const many = data.read.length > 1;
  const className = new Map(data.read.map((c) => [c.id, words(c)]));
  return {
    key: `period:${week}~${code}`,
    kind: "period",
    title: `${label}, week of ${dayMonth(week)}`,
    line: `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"} · ${minutes.toLocaleString("en-IN")} minutes`,
    closeHref,
    tabs: [
      {
        key: "lessons",
        label: "Lessons",
        body: lessons.length ? (
          <ul className="ts-lessons" data-week-lessons>
            {lessons.map((l) => (
              <li key={l.id} data-lesson={l.id}>
                <Link href={`/period/${l.id}`}>{l.activity ?? (l.text || label)}</Link>
                <span className="b-label b-muted">
                  {dateWords(l.day)} · {l.starts_at}
                  {many ? ` · ${className.get(l.class_id) ?? ""}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">No lessons of this subject in this week.</p>
        ),
      },
    ],
  };
}
