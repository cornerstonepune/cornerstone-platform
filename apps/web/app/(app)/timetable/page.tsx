import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Icon } from "@/lib/icons";
import { Screen } from "@/components/app-frame";
import { GridRefused } from "@/components/grid-refused";
import { TimetableRail } from "@/components/timetable-rail";
import { Cards } from "@/components/cards";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FortnightGrid } from "@/components/fortnight-grid";
import { ViewToggle } from "@/components/kanban-board";
import { StatusChip } from "@/components/status-chip";
import { Timeline, type Seen } from "@/components/timeline";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { lessonPanel } from "@/components/lesson-panel";
import { SubjectMix } from "@/components/subject-tag";
import { lessonIds, lessonView } from "@/lib/lesson-view";
import { requireStaff } from "@/lib/auth";
import { choices } from "@/lib/choices";
import { chipOf } from "@/lib/educator/chip";
import { mondayOf, nowAtSchool, schoolDay, shortDate, whenIs } from "@/lib/educator/clock";
import { weekOrNull } from "@/lib/educator/data";
import { isDay, isLesson } from "@/lib/educator/period";
import { dateWords } from "@/lib/week";
import { stateWords } from "@/lib/fortnight-words";
import { gridOf, moveInto } from "@/lib/timetable-grid";
import { classesOf, subjectLooks, clashesOf, fortnightAfter, fortnightAt, fortnightNumber, fortnightsOfYear, isCoordinator, liveIds, liveWords, movesOf, noSchoolOn, switchedOn, yearFor, type Fn } from "@/lib/timetable-ui";
import { schoolToday } from "@/lib/voice-page";
import { DayOnPhone } from "./day-on-phone";
import "./timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable";
const VIEWS = ["day", "week", "fortnight"] as const;
type View = (typeof VIEWS)[number];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The timetable: the fortnight is the unit. Week A and week B, each period a block; a moved period is marked with who and why,
// and a clash is red until the coordinator accepts it (docs/frontend/SPEC.md, Timetable). The sessions are the engine's
// (/timetable/week). The coordinator opens any fortnight in any state, read-only, its state said above the grid; an educator sees
// only what is live, and with nothing live a plain page says so, never "not found" (issue #691).
export default async function TimetablePage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const today = await schoolToday();
  if (q.day !== undefined && !isDay(q.day)) notFound();
  // a day named in the address decides the fortnight it is shown in (stepping across a fortnight's edge); otherwise today does
  const named = q.day && isDay(q.day) ? q.day : undefined;
  const here = await fortnightAt(named ?? today, q.class);
  const after = here ? await fortnightAfter(here) : null;
  const asked = /^\d+$/.test(q.fn ?? "") ? await fortnightNumber(Number(q.fn)) : null;
  const fn = asked ?? (!named && q.when === "next" && here ? after : here);
  // the wireframe opens on the week (the week that holds today, or the first week of the fortnight on a holiday); a phone opens on the day
  const view: View = (VIEWS as readonly string[]).includes(q.view ?? "") ? (q.view as View) : "week";
  const keep = (extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: q.class, when: q.when, fn: q.fn, view, ...extra })) if (v) p.set(k, v);
    return `${HERE}?${p}`;
  };

  if (!fn) {
    return (
      <Screen stage="Timetable" title="Timetable" purpose="No teaching fortnight is set up for the dates ahead." rail={<TimetableRail here="grid" coordinator={coordinator} />}>
        <EmptyState next={coordinator ? { href: "/timetable/draft", label: "Make a draft" } : undefined}>No timetable live for this class yet.</EmptyState>
      </Screen>
    );
  }

  // the coordinator chooses among every class of the year; with none chosen, the first with lessons in this fortnight
  const all = coordinator ? await classesOf(fn) : [];
  const classId = q.class ?? (coordinator ? (all.find((c) => c.lessons > 0) ?? all[0])?.id : undefined);
  const read = await Promise.all([fn.starts_on, addDays(fn.starts_on, 7)].map((w) => weekOrNull(me, { class_id: classId, week_of: w })));
  const weeks = read.every((w) => w !== null) ? read : null;
  const on = await switchedOn();
  const plan = coordinator && classId ? await yearFor(fn, classId) : [];
  const live = liveIds(plan, today, on);
  const said = liveWords(fn.state, { on, live: live.has(fn.id), lessons: plan.find((r) => r.id === fn.id)?.lessons ?? 0, from: fn.starts_on > today ? fn.starts_on : undefined });
  // no fortnight runs today (the vacation, or the days before the first): the page opens on the next one and says so
  const ahead = !q.fn && !q.day && q.when !== "next" && today < fn.starts_on;
  const aheadLine = ahead ? (
    <p className="tt-note" data-no-fortnight-today>
      {(await noSchoolOn(today)) ? "School is on holiday" : "No fortnight runs today"}; Fortnight {fn.number} starts on {dateWords(fn.starts_on)}.
    </p>
  ) : null;
  const choose = coordinator ? await coordinatorFilters(fn, all, classId, live, today) : null;
  // Live or Planning, said beside the eyebrow (the coordinator's; an educator sees only what is live)
  const chip = coordinator ? (
    <span data-fortnight-state={fn.state}>
      <StatusChip state={live.has(fn.id) ? "done" : "waiting"} words={said} compact round />
    </span>
  ) : null;
  if (!weeks) {
    // an educator the engine does not answer (switched off, or no class of hers has lessons then): a plain page, never "not found"
    if (!coordinator) {
      return (
        <Screen stage="Timetable" title="Timetable" purpose="Your class's fortnight, once the coordinator makes it live." rail={<TimetableRail here="grid" fn={fn.number} coordinator={false} />}>
          <EmptyState>
            <span data-not-live>{on ? "No timetable is live for your class yet." : "No timetable is live yet."} The coordinator makes one live from Setup, Fortnight.</span>
          </EmptyState>
        </Screen>
      );
    }
    // the coordinator, whom the engine could not answer for this class: the fortnight, its state and the pickers still show. Lessons
    // placed and unread means the engine refused her (it shows a class's grid to that class's own educator): said so, not as a success.
    const placed = all.find((c) => c.id === classId)?.lessons;
    const refused = classId && placed ? placed : 0;
    return (
      <Screen stage={`Fortnight ${fn.number}`} title="Timetable" purpose="Every fortnight, in any state, read-only: what is placed, and whether educators see it yet." next={{ href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}` }} stageChip={chip} rail={<TimetableRail here="grid" fn={fn.number} classId={classId} coordinator />}>
        {aheadLine}
        {choose ? <FilterBar action={HERE} keep={{ view }} filters={choose} /> : null}
        {refused ? (
          <GridRefused lessons={refused} fortnight={fn.number} next={{ href: `/timetable/fortnight/${fn.number}`, label: `Open Fortnight ${fn.number}` }} />
        ) : (
          <EmptyState next={{ href: `/timetable/fortnight/${fn.number}`, label: `Open Fortnight ${fn.number}` }}>
            {placedWords(all.length, fn.number)}
          </EmptyState>
        )}
      </Screen>
    );
  }
  const klass = weeks[0].class;
  const clashes = await clashesOf(fn.id);
  const moves = await movesOf(fn.id);
  const focus = q.day && weeks.some((w) => w.days.some((d) => d.day === q.day)) ? q.day : today >= fn.starts_on && today <= fn.ends_on ? today : fn.starts_on;
  const shown = view === "day" ? [focus] : view === "week" ? weeks.find((w) => w.days.some((d) => d.day === focus))!.days.map((d) => d.day) : undefined;
  const now = await nowAtSchool();
  // a block opens its lesson in the panel on the right (page charter A2); the address carries it (`open=lesson:<id>`), so it is linked and reloaded
  const shownDays = (shown ?? weeks.flatMap((w) => w.days.map((d) => d.day))) as string[];
  const ids = await lessonIds(klass.id, shownDays);
  const opened = parseOpen(q.open);
  const at = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: q.class, when: q.when, fn: q.fn, view: q.view, day: q.day, ...extra })) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `${HERE}?${str}` : HERE;
  };
  const grid = gridOf(weeks, {
    looks: await subjectLooks(),
    days: shown,
    clashes,
    at: { today, now },
    select: (day, p) => {
      const l = ids.get(`${day}~${p}`);
      return l ? { href: at({ open: `lesson:${l.id}` }), key: `lesson:${l.id}`, selected: opened?.kind === "lesson" && opened.id === l.id, machine: l.origin === "machine" } : undefined;
    },
  });
  const lessons = grid.rows.some((r) => "cells" in r && r.cells.some((c) => c));
  const movedHere = grid.placed.filter((x) => x.cell.moved).map((x) => ({ day: x.day, periodId: x.periodId, cell: x.cell, move: moveInto(moves, x.day, x.periodId) }));
  // the clashes of the days shown (page charter B2: the panel counts the week shown, not the whole fortnight)
  const open = clashes.filter((c) => !c.accepted && c.places.some((p) => p.class === klass.id && shownDays.includes(p.date))).length;
  const lessonCount = grid.placed.length;
  const holidayCount = grid.holidays.length;
  // Day view: what comes next (the period running now, else the next one; a day gone by says so), as the old Your day page did
  const dayPeriods = view === "day" ? (weeks.flatMap((w) => w.days).find((d) => d.day === focus)?.periods ?? []).filter(isLesson) : [];
  const dayWhen = whenIs(focus, today);
  const nextPeriod = view === "day" ? (dayPeriods.find((p) => chipOf(p, { now, day: dayWhen }) === "doNow") ?? (dayWhen === "past" ? undefined : dayPeriods.find((p) => dayWhen === "future" || p.starts_at > now))) : undefined;
  const changed: Seen[] = [
    ...clashes.filter((c) => !c.accepted).map((c) => ({ kind: "period" as const, title: c.detail, line: "Not yet accepted", when: "clash" })),
    ...moves.slice(0, 4).map((m) => ({ kind: "period" as const, title: m.undo ? "A move was undone" : "A lesson was moved by hand", line: `${m.who}${m.why ? `: ${m.why}` : ""}`, when: dateWords(m.at.slice(0, 10)) })),
  ].slice(0, 5);

  // the panel: the lesson chosen (its own page's data, lib/lesson-view.ts), or this view's numbers when none is
  const chosen = opened?.kind === "lesson" ? grid.placed.find((x) => x.cell.openKey === `lesson:${opened.id}`) : undefined;
  const lesson = chosen ? await lessonView(me, opened!.id) : null;
  const move = chosen ? moveInto(moves, chosen.day, chosen.periodId) : undefined;
  const panelOpen: Opened | null = lesson
    ? lessonPanel(lesson, {
        key: `lesson:${opened!.id}`,
        closeHref: at({ open: undefined, tab: undefined }),
        tab: q.tab,
        move: coordinator ? `/timetable/fortnight/${fn.number}?${new URLSearchParams({ class: klass.id, from: `${chosen!.day}~${chosen!.periodId}` })}` : undefined,
        moved: chosen!.cell.moved ? (move ? `by ${move.who} on ${dateWords(move.at.slice(0, 10))}${move.why ? `, because ${move.why}` : ""}` : "moved by hand") : undefined,
        clash: chosen!.cell.note,
      })
    : null;
  // the share of the lessons shown by subject: each subject of the blocks by its own name (the subject rows), in its colour
  const names = new Map((await choices()).subjects.map((s) => [s.code, s.label]));
  const mix = [...Map.groupBy(grid.placed, (x) => x.code ?? "").entries()]
    .map(([code, xs]) => ({ look: xs[0].cell.subject, words: names.get(code) ?? (code || "No subject"), n: xs.length }))
    .sort((a, b) => b.n - a.n || a.words.localeCompare(b.words));
  const spanWords = view === "day" ? "This day" : view === "week" ? "This week" : "This fortnight";

  return (
    <Screen
      stage={`${klass.grade} ${klass.section} · Fortnight ${fn.number}${view === "fortnight" ? "" : ` · week ${"AB"[Math.max(0, weeks.findIndex((w) => w.days.some((d) => d.day === focus)))]}`}`}
      stageChip={chip}
      title="Timetable"
      purpose="The fortnight is the unit: week A and week B, each period a block. A moved period is marked; a clash is red until it is accepted."
      next={{ href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}` }}
      // the page's one primary action, under the title (page charter A3, B2)
      action={<a className="btn" href={keep({ view: "day", day: today, fn: undefined, when: undefined })} data-today-link>Open today</a>}
      panel={
        <DetailPanel
          open={panelOpen}
          summary={{
            title: spanWords,
            stats: [
              { id: "lessons", n: lessonCount, line: lessonCount === 1 ? "lesson" : "lessons" },
              { id: "moved", n: movedHere.length, line: "moved by hand", tone: movedHere.length ? "wait" : undefined },
              { id: "clashes", n: open, line: open === 1 ? "clash not accepted" : "clashes not accepted", tone: open ? "act" : undefined },
            ],
            after: (
              <>
                <SubjectMix label="Lessons by subject" parts={mix} percent />
                {changed.length ? (
                  <section aria-label="Changed this fortnight" data-rail-part="changed">
                    <h3 className="b-label b-muted">Changed this fortnight</h3>
                    <Timeline entries={changed} />
                  </section>
                ) : null}
              </>
            ),
          }}
        />
      }
    >
      <DayOnPhone chosen={(VIEWS as readonly string[]).includes(q.view ?? "")} />
      {aheadLine}
      <div className="tt-filters">
      <FilterBar
        action={HERE}
        keep={choose ? { view } : { view, day: q.day, fn: q.fn }}
        filters={choose ?? [
          ...(coordinator || weeks[0].classes.length > 1 ? [{ name: "class", label: "Class", value: klass.id, required: true, all: "", options: weeks[0].classes.map((c) => [c.id, `${c.grade} ${c.section}`] as const) }] : []),
          { name: "when", label: "Fortnight", value: q.when === "next" ? "next" : "this", required: true, all: "", options: [["this", `This: ${here ? `${here.number} (${span(here)})` : "this fortnight"}`], ["next", `Next: ${after ? `${after.number} (${span(after)})` : "next fortnight"}`]] as const },
        ]}
      />
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
            {/* arrows, named in full for a screen reader and on hover: the row holds the filters, the view and the steps on one line beside the panel */}
            <Link href={keep({ view, fn: undefined, day: view === "day" ? schoolDay(focus, -1) : mondayOf(focus, -1) })} className="chip" data-step="back" aria-label={view === "day" ? "Previous day" : "Previous week"} title={view === "day" ? "Previous day" : "Previous week"}><Icon name="previous" size={18} /></Link>
            <Link href={keep({ view, fn: undefined, day: view === "day" ? schoolDay(focus, 1) : mondayOf(focus, 1) })} className="chip" data-step="on" aria-label={view === "day" ? "Next day" : "Next week"} title={view === "day" ? "Next day" : "Next week"}><Icon name="following" size={18} /></Link>
          </>
        ) : null}
      </div>
      <div className="tt-legend" data-legend>
        <StatusChip state="done" words="Done" round />
        <StatusChip state="moved" words="Moved by hand" round />
        <StatusChip state="clash" words="Clash, not yet accepted" round />
        <StatusChip state="doNow" words="Do now" round />
        <StatusChip state="late" words="Late" round />
        <span className="tt-note">Each block is one lesson; choose it to see the lesson on the right.</span>
      </div>
      <p className="tt-note" data-summary>
        {lessonCount} lesson{lessonCount === 1 ? "" : "s"}{holidayCount ? ` · ${holidayCount} holiday${holidayCount === 1 ? "" : "s"}` : ""}
      </p>
      {view === "day" ? (
        <p className="tt-note" data-next>
          {nextPeriod ? `Next: ${nextPeriod.starts_at.slice(0, 5)} ${nextPeriod.name}` : dayPeriods.length ? "This day is over." : "No lessons on this day."}
        </p>
      ) : null}
      {open ? <p className="tt-note" data-clashes={open}>{open} clash{open === 1 ? "" : "es"} not accepted yet: red below.</p> : null}
      {lessons ? (
        <div data-view={view} data-day-count={grid.days.length}>
          <FortnightGrid days={grid.labels} today={shortDate(today)} rows={grid.rows} dayHrefs={grid.days.map((d) => keep({ view: "day", day: d }))} />
        </div>
      ) : (
        <EmptyState next={coordinator ? { href: "/timetable/draft", label: "Make a draft" } : undefined}>
          {coordinator ? `Nothing is placed for this class in these days of Fortnight ${fn.number} yet.` : "No timetable live for this class: nothing is placed in these days."}
        </EmptyState>
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
              <li key={`${m.day}-${m.periodId}`} data-moved-detail>
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
          { kind: "activity", title: "Materials for this fortnight", line: "What the plan needs, line by line.", href: "/timetable/materials", link: "Open materials" },
        ]}
      />
    </Screen>
  );
}

/** The coordinator's two pickers: the class (every class of the year, with its lessons this fortnight as a whole count) and the
 *  fortnight (every teaching fortnight of the year, in groups: Live, Planning, Earlier; each with its state and its dates), so any
 *  fortnight in any state can be reached (#691). */
async function coordinatorFilters(fn: Fn, all: { id: string; grade: string; section: string; lessons: number }[], classId: string | undefined, live: Set<string>, today: string) {
  const fns = await fortnightsOfYear(fn);
  const group = (f: (typeof fns)[number]) => (live.has(f.id) ? "Live" : f.ends_on >= today ? "Planning" : "Earlier");
  return [
    { name: "class", label: "Class", value: classId ?? "", required: true, all: "", options: all.map((c) => [c.id, `${c.grade} ${c.section}`] as const) },
    {
      name: "fn",
      label: "Fortnight",
      value: String(fn.number),
      required: true,
      all: "",
      options: fns.map((f) => [String(f.number), `${f.number} · ${stateWords(f.state)} · ${span(f)}`] as const),
      groups: (["Live", "Planning", "Earlier"] as const).map((label) => ({ label, values: fns.filter((f) => group(f) === label).map((f) => String(f.number)) })).filter((g) => g.values.length),
    },
  ];
}

/** "16-Nov to 27-Nov": a fortnight's dates, as the wireframe's picker says them. */
const span = (f: { starts_on: string; ends_on: string }) => `${dateWords(f.starts_on).slice(0, 6)} to ${dateWords(f.ends_on).slice(0, 6)}`;

/** Why the coordinator sees no grid, in words, when it is not the engine's refusal (that is `GridRefused`): no class this year, or nothing placed yet. */
const placedWords = (classes: number, n: number) =>
  !classes ? "No class is set up for this year yet." : `Nothing is placed for this class in Fortnight ${n} yet.`;
