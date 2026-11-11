import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FortnightGrid } from "@/components/fortnight-grid";
import { ViewToggle } from "@/components/kanban-board";
import { StatusChip } from "@/components/status-chip";
import { Timeline, type Seen } from "@/components/timeline";
import type { Column } from "@/lib/ux-rules";
import { requireStaff } from "@/lib/auth";
import { chipOf } from "@/lib/educator/chip";
import { mondayOf, nowAtSchool, schoolDay, shortDate, whenIs } from "@/lib/educator/clock";
import { weekOf } from "@/lib/educator/data";
import { isDay, isLesson } from "@/lib/educator/period";
import { dateWords } from "@/lib/week";
import { stateWords } from "@/lib/fortnight-words";
import { sql } from "@/lib/db";
import { gridOf, moveInto } from "@/lib/timetable-grid";
import { subjectsAgainstRule, type SubjectRow } from "@/lib/timetable-subjects";
import { subjectLooks, clashesOf, fortnightAfter, fortnightAt, fortnightNumber, isCoordinator, movesOf } from "@/lib/timetable-ui";
import { schoolToday } from "@/lib/voice-page";
import { DayOnPhone } from "./day-on-phone";
import "./timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable";
const VIEWS = ["day", "week", "fortnight"] as const;
type View = (typeof VIEWS)[number];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const SUBJECT_COLUMNS: Column<SubjectRow>[] = [
  { key: "subject", label: "Subject", value: (r) => r.name },
  { key: "placed", label: "Lessons placed", value: (r) => r.placed, num: true },
  { key: "rule", label: "The rule", value: (r) => r.rule },
  { key: "against", label: "Against the rule", value: (r) => r.against?.note ?? "", status: true, cell: (r) => (r.against ? <StatusChip state={r.against.state} words={r.against.note} compact round /> : <span className="tt-note">–</span>) },
];

// The timetable: the fortnight is the unit. Week A and week B, each period a block; a moved period is marked with who and why,
// and a clash is red until the coordinator accepts it (docs/frontend/SPEC.md, Timetable). The sessions are the engine's
// (/timetable/week: it keeps the educator.timetable_enabled gate, so while that is off this page is not found, as before).
export default async function TimetablePage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const today = await schoolToday();
  if (q.day !== undefined && !isDay(q.day)) notFound();
  // a day named in the address decides the fortnight it is shown in (stepping across a fortnight's edge); otherwise today does
  const named = q.day && isDay(q.day) ? q.day : undefined;
  const here = await fortnightAt(named ?? today, q.class);
  const asked = /^\d+$/.test(q.fn ?? "") ? await fortnightNumber(Number(q.fn)) : null;
  const fn = asked ?? (!named && q.when === "next" && here ? await fortnightAfter(here) : here);
  const view: View = (VIEWS as readonly string[]).includes(q.view ?? "") ? (q.view as View) : "fortnight";
  const keep = (extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: q.class, when: q.when, fn: q.fn, view, ...extra })) if (v) p.set(k, v);
    return `${HERE}?${p}`;
  };

  if (!fn) {
    return (
      <Screen stage="Timetable" title="Timetable" purpose="No teaching fortnight is set up for the dates ahead.">
        <EmptyState next={coordinator ? { href: "/timetable/draft", label: "Make a draft" } : undefined}>No timetable live for this class yet.</EmptyState>
      </Screen>
    );
  }

  const weeks = await Promise.all([fn.starts_on, addDays(fn.starts_on, 7)].map((w) => weekOf(me, { class_id: q.class, week_of: w })));
  const klass = weeks[0].class;
  const clashes = await clashesOf(fn.id);
  const moves = await movesOf(fn.id);
  const focus = q.day && weeks.some((w) => w.days.some((d) => d.day === q.day)) ? q.day : today >= fn.starts_on && today <= fn.ends_on ? today : fn.starts_on;
  const shown = view === "day" ? [focus] : view === "week" ? weeks.find((w) => w.days.some((d) => d.day === focus))!.days.map((d) => d.day) : undefined;
  const now = await nowAtSchool();
  const sessions = await sql<{ id: string; on_date: string; period_id: string }[]>`
    select s.id, d.on_date::text as on_date, s.period_id from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${klass.id} and d.on_date between ${fn.starts_on}::date and ${fn.ends_on}::date`;
  const sessionAt = new Map(sessions.map((r) => [`${r.on_date}|${r.period_id}`, r.id]));
  const grid = gridOf(weeks, {
    looks: await subjectLooks(),
    days: shown,
    clashes,
    at: { today, now },
    href: (day, p) => (sessionAt.has(`${day}|${p}`) ? `/period/${sessionAt.get(`${day}|${p}`)}` : keep({ view: "day", day })),
  });
  const lessons = grid.rows.some((r) => "cells" in r && r.cells.some((c) => c));
  const movedHere = grid.placed.filter((x) => x.cell.moved).map((x) => ({ day: x.day, cell: x.cell, move: moveInto(moves, x.day, x.periodId) }));
  const open = clashes.filter((c) => !c.accepted).length;
  const shownDays = weeks.flatMap((w) => w.days).filter((d) => grid.days.includes(d.day));
  const lessonCount = grid.placed.length;
  const holidayCount = grid.holidays.length;
  // Day view: what comes next (the period running now, else the next one; a day gone by says so)
  const dayPeriods = view === "day" ? (shownDays[0]?.periods ?? []).filter(isLesson) : [];
  const dayWhen = whenIs(focus, today);
  const nextPeriod = view === "day" ? dayPeriods.find((p) => chipOf(p, { now, day: dayWhen }) === "doNow") ?? (dayWhen === "past" ? undefined : dayPeriods.find((p) => dayWhen === "future" || p.starts_at > now)) : undefined;
  const bySubject = await subjectsAgainstRule(klass.id, fn.starts_on, fn.ends_on);
  const changed: Seen[] = [
    ...clashes.filter((c) => !c.accepted).map((c) => ({ kind: "period" as const, title: c.detail, line: "Not yet accepted", when: "clash" })),
    ...moves.slice(0, 4).map((m) => ({ kind: "period" as const, title: m.undo ? "A move was undone" : "A lesson was moved by hand", line: `${m.who}${m.why ? `: ${m.why}` : ""}`, when: dateWords(m.at.slice(0, 10)) })),
  ].slice(0, 5);

  return (
    <Screen
      stage={`${klass.grade} ${klass.section} · Fortnight ${fn.number}`}
      title="Timetable"
      purpose="The fortnight is the unit: week A and week B, each period a block. A moved period is marked; a clash is red until it is accepted."
      action={<a className="btn" href={keep({ view: "day", day: today })} data-ux="action">Open today</a>}
      next={{ href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}` }}
      rail={
        <div className="tt-rail">
        <Rail
          edges={[
            { screen: "fortnight", params: { n: String(fn.number) }, href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}`, icon: "fortnight" },
            { screen: "materials", label: "Materials, this fortnight", icon: "activity" },
            { screen: "period", params: { id: "today" }, label: "Today’s period", icon: "period" },
            ...(coordinator ? [{ screen: "rules", href: "/timetable/rules", label: "Timetable rules", icon: "setup" as const }] : []),
          ]}
        />
        {changed.length ? (
          <section aria-label="Changed this fortnight" data-rail-part="changed" className="tt-rail-card">
            <h2 className="tt-rail-h">Changed this fortnight</h2>
            <Timeline entries={changed} />
          </section>
        ) : null}
        </div>
      }
    >
      <DayOnPhone chosen={(VIEWS as readonly string[]).includes(q.view ?? "")} />
      <FilterBar
        action={HERE}
        keep={{ view, day: q.day, fn: q.fn }}
        filters={[
          ...(coordinator || weeks[0].classes.length > 1 ? [{ name: "class", label: "Class", value: klass.id, required: true, all: "", options: weeks[0].classes.map((c) => [c.id, `${c.grade} ${c.section}`] as const) }] : []),
          { name: "when", label: "Fortnight", value: q.when === "next" ? "next" : "this", required: true, all: "", options: [["this", "This fortnight"], ["next", "Next fortnight"]] as const },
        ]}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ViewToggle
          current={view}
          views={[
            { key: "day", label: "Day", icon: "today", href: keep({ view: "day" }) },
            { key: "week", label: "Week", icon: "week", href: keep({ view: "week" }) },
            { key: "fortnight", label: "Fortnight", icon: "fortnight", href: keep({ view: "fortnight" }) },
          ]}
        />
        {view !== "fortnight" ? (
          <>
            <Link href={keep({ view, fn: undefined, day: view === "day" ? schoolDay(focus, -1) : mondayOf(focus, -1) })} className="chip" data-step="back">{view === "day" ? "Previous day" : "Previous week"}</Link>
            <Link href={keep({ view, fn: undefined, day: view === "day" ? schoolDay(focus, 1) : mondayOf(focus, 1) })} className="chip" data-step="on">{view === "day" ? "Next day" : "Next week"}</Link>
          </>
        ) : null}
        <Link href={keep({ view: "day", day: today })} className="chip" data-today-link>Today</Link>
      </div>
      <div className="tt-legend" data-legend>
        <StatusChip state="done" words="Done" round />
        <StatusChip state="moved" words="Moved by hand" round />
        <StatusChip state="clash" words="Clash, not yet accepted" round />
        <StatusChip state="doNow" words="Do now" round />
        <StatusChip state="late" words="Late" round />
        <span className="tt-note">Each block is one lesson; tap it to open the period.</span>
      </div>
      <p className="tt-note" data-summary>
        {lessonCount} lesson{lessonCount === 1 ? "" : "s"}{holidayCount ? ` · ${holidayCount} holiday${holidayCount === 1 ? "" : "s"}` : ""}
      </p>
      {view === "day" ? (
        <p className="tt-note" data-next>
          {nextPeriod ? `Next: ${nextPeriod.starts_at.slice(0, 5)} ${nextPeriod.name}` : "This day is over."}
        </p>
      ) : null}
      {open ? <p className="tt-note" data-clashes={open}>{open} clash{open === 1 ? "" : "es"} not accepted yet: red below.</p> : null}
      {lessons ? (
        <div data-view={view} data-day-count={grid.days.length}>
          <FortnightGrid days={grid.labels} today={shortDate(today)} rows={grid.rows} dayHrefs={grid.days.map((d) => keep({ view: "day", day: d }))} />
        </div>
      ) : (
        <EmptyState next={coordinator ? { href: "/timetable/draft", label: "Make a draft" } : undefined}>No timetable live for this class: nothing is placed in these days.</EmptyState>
      )}
      {grid.holidays.length ? (
        <ul className="tt-list" data-holidays>
          {grid.holidays.map((h) => (
            <li key={h.day}>
              <strong>{shortDate(h.day)}</strong>: {h.words}
            </li>
          ))}
        </ul>
      ) : null}
      {movedHere.length ? (
        <Details summary={`Moved periods (${movedHere.length})`} id="moved">
          <ul className="tt-list">
            {movedHere.map((m) => (
              <li key={`${m.day}-${m.cell!.href}`} data-moved-detail>
                <strong>{m.cell!.activity}</strong>, {shortDate(m.day)}:{" "}
                {m.move ? `moved by ${m.move.who} on ${dateWords(m.move.at.slice(0, 10))}${m.move.why ? `, because ${m.move.why}` : ""}.` : "moved (the record of who and why is not kept for this one)."}
              </li>
            ))}
          </ul>
        </Details>
      ) : null}
      <Cards
        cards={[
          { kind: "period", title: `Fortnight ${fn.number}`, line: `${stateWords(fn.state)} · ${dateWords(fn.starts_on)} to ${dateWords(fn.ends_on)}`, href: `/timetable/fortnight/${fn.number}`, link: "Open the fortnight" },
          { kind: "activity", title: "Materials for this fortnight", line: "What the plan needs, line by line.", href: "/educator/materials", link: "Open materials" },
        ]}
      />
      <h2 className="tt-h">This fortnight, lessons by subject</h2>
      {bySubject.length ? (
        <DataTable label="Lessons by subject" columns={SUBJECT_COLUMNS} rows={bySubject} rowKey={(r) => r.code} limit={bySubject.length} more={{ page: 1, href: () => "#" }} extras={{ attrs: (r) => ({ "data-subject-row": r.code }) }} />
      ) : (
        <p className="tt-empty">No lessons placed in this fortnight.</p>
      )}
    </Screen>
  );
}
