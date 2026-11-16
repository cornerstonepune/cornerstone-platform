import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { ViewToggle } from "@/components/kanban-board";
import { StatusChip } from "@/components/status-chip";
import { SubjectTag } from "@/components/subject-tag";
import { requireStaff } from "@/lib/auth";
import { weekOrNull } from "@/lib/educator/data";
import { grades } from "@/lib/queries";
import { subjectLook, subjectLooks } from "@/lib/subject-looks";
import { chipOf, firstGradeTaught, hoursOf, lessonsOf, parseChoice, PERIODS, periodOf, termsOf, timeBySubject, type Chosen, type ClassRef, type SubjectTime } from "@/lib/time-by-subject";
import { isCoordinator } from "@/lib/timetable-ui";
import type { Column } from "@/lib/ux-rules";
import { schoolToday } from "@/lib/voice-page";
import { classWords } from "@/lib/voice-types";
import { dateWords } from "@/lib/week";
import "./time.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable/time";

// Time by subject (docs/frontend/page-charter.md B3; reshaped 16 Nov 2026, Nimish: "it should show how much of the timetable's allocation is
// for which subject, with a period picker"): for each subject, the minutes the timetable's lessons give it in the period (planned) and the
// minutes of those lessons that have been taught (their state is done), each a bar and a number, for one class, a grade or every class. Every
// number is the engine's (/timetable/time, the sum of the lessons' period lengths); the target is the timetable rules' share, and a subject
// the rules give no time has none, so no chip. A subject's row opens that period's lessons of it on the right (A2).
export default async function TimeBySubjectPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const today = await schoolToday();
  const terms = await termsOf();
  const period = periodOf(q, today, terms);
  const dates = { start: period.start, end: period.end };
  const chosen: Chosen | null = parseChoice(q.class) ?? (await openingChoice(me, coordinator, dates));
  const data = chosen ? await timeBySubject(me, chosen, dates) : null;
  const at = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ range: q.range, from: q.from, to: q.to, class: q.class, ...extra })) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `${HERE}?${str}` : HERE;
  };
  const toggle = (
    <span data-ux="action" data-range-chooser>
      <ViewToggle
        current={period.key}
        views={PERIODS.filter((r) => r.key !== "term" || terms.length).map((r) => ({ key: r.key, label: r.label, icon: r.icon, href: at({ range: r.key, from: undefined, to: undefined, open: undefined }) }))}
      />
    </span>
  );
  // the dates, when the presets are not what is wanted: a plain GET form, the dates in the address
  const custom = (
    <form action={HERE} method="get" className="tt-form ts-dates" aria-label="Choose dates" data-custom-dates>
      {q.class ? <input type="hidden" name="class" value={q.class} /> : null}
      <label>
        From
        <input type="date" name="from" defaultValue={period.start} required />
      </label>
      <label>
        To
        <input type="date" name="to" defaultValue={period.end} required />
      </label>
      <button className="btn secondary">Show</button>
    </form>
  );
  const purpose = "How much of the timetable each subject gets, and how much of it has been taught.";
  if (!data) {
    return (
      <Screen stage="Timetable" title="Time by subject" purpose={purpose} panel={<DetailPanel summary={{ title: "This period", stats: [] }} />}>
        <div className="tt-filters" data-from={dates.start} data-to={dates.end}>{toggle}{custom}</div>
        <EmptyState>
          <span data-no-time>{chosen ? "Your class's timetable is not open to you yet." : "No class has lessons in these days."}</span>
        </EmptyState>
      </Screen>
    );
  }

  const looks = await subjectLooks();
  const gradeName = (await grades()).name;
  const words = (c: ClassRef) => classWords({ ...c, gradeName: gradeName(c.grade) });
  const value = "class_id" in chosen! ? chosen.class_id : "grade" in chosen! ? `all:${chosen.grade}` : "everyone";
  const allOf = coordinator ? [...new Set(data.may_read.map((c) => c.grade))].map((g) => [`all:${g}`, `All ${gradeName(g)}`] as const) : [];
  const options = [...(coordinator ? ([["everyone", "All classes"]] as const) : []), ...allOf, ...data.may_read.map((c) => [c.id, words(c)] as const)];
  const label = (code: string) => data.subjects.find((s) => s.subject === code)?.label ?? code;
  const taught = data.subjects.filter((s) => s.minutes > 0);
  const counts = { within: 0, off: 0 };
  for (const s of data.subjects) if (s.status === "within") counts.within++;
  else if (s.status === "over" || s.status === "short") counts.off++;

  const opened = parseOpen(q.open);
  const code = opened?.kind === "period" ? opened.id : undefined;
  const open = code && data.subjects.some((s) => s.subject === code) ? await lessonPanel(data, code, label(code), period.label, dates, words, at({ open: undefined })) : null;

  // the bars share one scale (the subject with the most planned time is full), so a subject's bar is its share of the longest
  const most = Math.max(1, ...data.subjects.map((s) => s.minutes));
  const bar = (kind: "planned" | "taught", minutes: number) => (
    <span className="ts-pt" data-bar={kind} data-minutes={minutes}>
      <span className="ts-pt-track" role="img" aria-label={`${kind === "planned" ? "Planned" : "Taught"}: ${hoursOf(minutes)}`}>
        <i data-kind={kind} style={{ width: `${(100 * minutes) / most}%` }} />
      </span>
      <b>{hoursOf(minutes)}</b>
    </span>
  );
  const columns: Column<SubjectTime>[] = [
    { key: "subject", label: "Subject", value: (r) => r.label, cell: (r) => (
      <Link href={at({ open: `period:${r.subject}` })} scroll={false} data-open-key={`period:${r.subject}`} aria-current={code === r.subject ? "true" : undefined}>
        <SubjectTag look={subjectLook(looks, r.subject)} words={r.label} />
      </Link>
    ) },
    { key: "planned", label: "Planned in the timetable", value: (r) => r.minutes, num: true, width: "16rem", cell: (r) => bar("planned", r.minutes) },
    { key: "taught", label: "Taught", value: (r) => r.done_minutes, num: true, width: "16rem", cell: (r) => bar("taught", r.done_minutes) },
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
  const classLine = "class_id" in chosen! ? words(data.read[0]) : "grade" in chosen! ? `All ${gradeName(chosen.grade)} (${data.read.length} ${data.read.length === 1 ? "class" : "classes"})` : `All classes (${data.read.length})`;

  return (
    <Screen
      stage={`${classLine} · ${dateWords(dates.start)} to ${dateWords(dates.end)}`}
      title="Time by subject"
      purpose={purpose}
      panel={
        <DetailPanel
          open={open}
          summary={{
            title: period.label,
            stats: [
              { id: "planned", n: data.total_minutes, line: "minutes planned" },
              { id: "taught", n: data.done_minutes, line: "minutes taught" },
              { id: "subjects", n: taught.length, line: taught.length === 1 ? "subject" : "subjects" },
              { id: "off", n: counts.off, line: "over or short of the target", tone: counts.off ? "act" : undefined },
            ],
          }}
        />
      }
    >
      <div className="tt-filters" data-from={dates.start} data-to={dates.end}>
        {toggle}
        <FilterBar action={HERE} keep={{ range: q.range, from: q.from, to: q.to }} filters={[{ name: "class", label: "Class", value, required: true, all: "", options }]} />
        {custom}
      </div>
      {data.total_minutes ? (
        <DataTable label="Time by subject" columns={columns} rows={data.subjects} rowKey={(r) => r.subject} limit={data.subjects.length} more={{ page: 1, href: () => "#" }} extras={{ attrs: (r) => ({ "data-subject-time": r.subject, "data-planned-minutes": String(r.minutes), "data-taught-minutes": String(r.done_minutes) }) }} />
      ) : (
        <EmptyState>
          <span data-no-lessons>No lessons in these days for {classLine}.</span>
        </EmptyState>
      )}
    </Screen>
  );
}

/** The class the page opens on when none is chosen: a coordinator, every class of the first grade taught in the period; anyone else, the
 *  first class she holds (the engine's own list, /timetable/week). None when there is nothing to open on. */
async function openingChoice(me: { email: string }, coordinator: boolean, dates: { start: string; end: string }): Promise<Chosen | null> {
  if (coordinator) {
    const grade = await firstGradeTaught(dates);
    return grade ? { grade } : null;
  }
  const week = await weekOrNull(me, { week_of: dates.end });
  return week ? { class_id: week.class.id } : null;
}

/** One subject's lessons in the period, for the panel: each a link to the lesson, with its day, time and class, and whether it was taught. */
async function lessonPanel(
  data: { read: ClassRef[]; subjects: SubjectTime[] },
  code: string,
  name: string,
  periodWords: string,
  dates: { start: string; end: string },
  words: (c: ClassRef) => string,
  closeHref: string,
): Promise<Opened> {
  const lessons = await lessonsOf(data.read.map((c) => c.id), code, dates);
  const row = data.subjects.find((s) => s.subject === code);
  const many = data.read.length > 1;
  const className = new Map(data.read.map((c) => [c.id, words(c)]));
  return {
    key: `period:${code}`,
    kind: "period",
    title: `${name}, ${periodWords.toLowerCase()}`,
    line: `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"} · ${hoursOf(row?.minutes ?? 0)} planned · ${hoursOf(row?.done_minutes ?? 0)} taught`,
    closeHref,
    tabs: [
      {
        key: "lessons",
        label: "Lessons",
        body: lessons.length ? (
          <ul className="ts-lessons" data-week-lessons>
            {lessons.map((l) => (
              <li key={l.id} data-lesson={l.id} data-taught={l.done ? "yes" : "no"}>
                <Link href={`/period/${l.id}`}>{l.activity ?? (l.text || name)}</Link>
                <span className="b-label b-muted">
                  {dateWords(l.day)} · {l.starts_at}
                  {many ? ` · ${className.get(l.class_id) ?? ""}` : ""} · {l.done ? "Taught" : "Not taught yet"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">No lessons of this subject in these days.</p>
        ),
      },
    ],
  };
}
