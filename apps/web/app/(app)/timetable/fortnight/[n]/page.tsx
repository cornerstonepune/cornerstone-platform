import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DetailPanel } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FortnightGrid } from "@/components/fortnight-grid";
import { GridRefused } from "@/components/grid-refused";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { weekOrNull } from "@/lib/educator/data";
import { dateWords } from "@/lib/week";
import { draftReads, draftsOf } from "@/lib/timetable-draft";
import { gridOf } from "@/lib/timetable-grid";
import { classesOf, clashesOf, fortnightNumber, fortnightsOfYear, isCoordinator, liveIds, liveWords, movesOf, subjectLooks, switchedOn, yearFor } from "@/lib/timetable-ui";
import { schoolToday } from "@/lib/voice-page";
import { nowAtSchool, shortDate } from "@/lib/educator/clock";
import { sql } from "@/lib/db";
import { fortnightPanel } from "./fortnight-panel";
import "../../timetable.css";

type Props = { params: Promise<{ n: string }>; searchParams: Promise<Record<string, string | undefined>> };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// A fortnight, and the one page of its work (Nimish, 12 Nov 2026: "this is where the freezing happens, where the movement happens, where
// the rules are seen if they conflict when the movement is being shown"): the whole fortnight as lesson blocks, week A and week B; the
// coordinator takes its next step (Freeze, Align, Approve, then Go live) and moves a lesson by choosing it and then the lesson or free slot
// to swap it with; a clash the move makes is drawn on the grid at once, red, in the rule's own words, and accepted here with a reason. The
// engine decides every step and every move and says why when it refuses; nothing is checked here. An educator reads the same grid.
export default async function FortnightPage({ params, searchParams }: Props) {
  const me = await requireStaff();
  const { n } = await params;
  const q = await searchParams;
  const fn = /^\d+$/.test(n) ? await fortnightNumber(Number(n)) : null;
  if (!fn) notFound();
  const [coordinator, today, on, year] = await Promise.all([isCoordinator(), schoolToday(), switchedOn(), fortnightsOfYear(fn)]);
  const here = `/timetable/fortnight/${fn.number}`;
  const all = coordinator ? await classesOf(fn) : [];
  const classId = q.class ?? (coordinator ? (all.find((c) => c.lessons > 0) ?? all[0])?.id : undefined);
  const read = await Promise.all([fn.starts_on, addDays(fn.starts_on, 7)].map((w) => weekOrNull(me, { class_id: classId, week_of: w })));
  const plan = coordinator && classId ? await yearFor(fn, classId) : [];
  const live = liveIds(plan, today, on);
  const said = liveWords(fn.state, { on, live: live.has(fn.id), lessons: plan.find((r) => r.id === fn.id)?.lessons ?? 0, from: fn.starts_on > today ? fn.starts_on : undefined });
  const span = `${dateWords(fn.starts_on)} to ${dateWords(fn.ends_on)}`;
  const chip = coordinator ? (
    <span data-fortnight-state={fn.state}>
      <StatusChip state={live.has(fn.id) ? "done" : "waiting"} words={said} compact round />
    </span>
  ) : null;
  const at = year.findIndex((y) => y.id === fn.id);
  const step = (y: (typeof year)[number] | undefined) => (y ? `/timetable/fortnight/${y.number}${classId ? `?class=${classId}` : ""}` : null);
  const [before, after] = [step(year[at - 1]), step(year[at + 1])];

  if (read.some((w) => w === null)) {
    return (
      <Screen stage={span} stageChip={chip} title={`Fortnight ${fn.number}`} purpose="Its lessons as blocks, and the work on them: freeze, move, approve." next={{ href: "/timetable", label: "Timetable" }}>
        <GridRefused fortnight={fn.number} next={{ href: "/timetable", label: "Timetable" }} />
      </Screen>
    );
  }
  const weeks = read.filter((w) => w !== null);
  const klass = weeks[0].class;
  const [clashes, moves, now] = await Promise.all([clashesOf(fn.id), movesOf(fn.id), nowAtSchool()]);
  const mine = moves.filter((m) => m.class_id === klass.id);
  const open = clashes.filter((c) => !c.accepted && c.places.some((p) => p.class === klass.id));
  const started = fn.starts_on <= today;
  const [{ placedDrafts }] = await sql<{ placedDrafts: number }[]>`select count(distinct school_class_id)::int as "placedDrafts" from timetable_run where fortnight_id = ${fn.id} and outcome = 'placed'`;
  const canGoLive = coordinator && !started && fn.state === "approved" && placedDrafts > 0;
  const subjects = Object.fromEntries((await sql<{ code: string; name: string }[]>`select code, coalesce(label, name) as name from subject`).map((r) => [r.code, r.name]));

  // the move: the coordinator's first click chooses a lesson, the second the lesson or free slot to swap it with; the engine does the rest
  const stay = (extra: Record<string, string> = {}) => `${here}?${new URLSearchParams({ class: klass.id, ...extra })}`;
  const [fromDay, fromPeriod] = (q.from ?? "").split("~");
  const [toDay, toPeriod] = (q.to ?? "").split("~");
  const ords = new Map((await sql<{ id: string; ord: number }[]>`select id, ord from period where grade_code = ${klass.grade}`).map((p) => [p.id, p.ord]));
  const chosen = coordinator && fromDay && ords.has(fromPeriod) ? { day: fromDay, periodId: fromPeriod } : null;
  const ready = chosen && toDay && ords.has(toPeriod) && !(toDay === fromDay && toPeriod === fromPeriod);
  const grid = gridOf(weeks, {
    looks: await subjectLooks(),
    clashes,
    at: { today, now },
    open: (day, p) => `/period/${p}?${new URLSearchParams({ class: klass.id, day })}`,
    pick: coordinator ? (day, p) => (!chosen ? stay({ from: `${day}~${p}` }) : chosen.day === day && chosen.periodId === p ? stay() : stay({ from: `${fromDay}~${fromPeriod}`, to: `${day}~${p}` })) : undefined,
    picked: chosen,
  });
  const [{ label: yearLabel }] = await sql<{ label: string }[]>`select y.label from fortnight f join academic_year y on y.id = f.academic_year_id where f.id = ${fn.id}`;
  const lessonWords = (day: string, p: string) => grid.placed.find((x) => x.day === day && x.periodId === p)?.cell.activity ?? "a free slot";
  const [drafts, reads] = await Promise.all([coordinator ? draftsOf(fn.id) : Promise.resolve([]), draftReads(klass.id, klass.grade, fn.id)]);
  // the panel: the fortnight's state and the coordinator's step at its top, then Conflicts · Moves · Draft · Rules; its forms come back
  // to their own tab
  const panel = fortnightPanel({
    fn, klass, span, yearLabel, coordinator, started, canGoLive, subjects, open, moves: mine, ords, lessonWords, drafts, reads, stay,
    chosen, to: ready ? { day: toDay, periodId: toPeriod } : null,
    tab: q.tab,
  });

  return (
    <Screen
      stage={`${span} · ${klass.grade} ${klass.section}`}
      stageChip={chip}
      title={`Fortnight ${fn.number}`}
      purpose="Its lessons as blocks, weeks A and B. Choose one to move it; its state, conflicts, moves, draft and rules are on the right."
      next={{ href: `/timetable?fn=${fn.number}&class=${klass.id}`, label: "Timetable" }}
      panel={<DetailPanel inline open={panel} summary={{ title: "", stats: [] }} />}
    >
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.done ? <p role="status" className="tt-note">Done.</p> : null}
      <div className="tt-filters">
        {coordinator ? <FilterBar action={here} filters={[{ name: "class", label: "Class", value: klass.id, required: true, all: "", options: all.map((c) => [c.id, `${c.grade} ${c.section}`] as const) }]} /> : null}
        {before ? <Link href={before} className="chip" data-step="back">Previous fortnight</Link> : null}
        {after ? <Link href={after} className="chip" data-step="on">Next fortnight</Link> : null}
      </div>
      <div className="tt-legend" data-legend>
        <StatusChip state="done" words="Done" round />
        <StatusChip state="moved" words="Moved by hand" round />
        <StatusChip state="clash" words="Clash, not yet accepted" round />
        <span className="tt-note">
          {coordinator ? (chosen ? `Chosen: ${lessonWords(chosen.day, chosen.periodId)}, ${shortDate(chosen.day)}. Now choose the lesson, or the free slot, to swap it with. ` : "Choose a lesson to move it, then the lesson or free slot to swap it with. ") : "Each block is one lesson; one with an activity opens it. "}
          {coordinator && chosen ? <Link href={stay()}>Cancel</Link> : null}
        </span>
      </div>
      {grid.rows.some((r) => "cells" in r && r.cells.some((c) => c)) ? (
        <FortnightGrid days={grid.labels} today={shortDate(today)} rows={grid.rows} />
      ) : (
        <EmptyState>{coordinator ? `Nothing is placed for this class in Fortnight ${fn.number} yet: make a draft from the Draft tab on the right.` : "No timetable is live for this class: nothing is placed in these days."}</EmptyState>
      )}
      <p className="tt-note" data-summary>{grid.placed.length} lesson{grid.placed.length === 1 ? "" : "s"} · {grid.placed.filter((x) => x.cell.href).length} with an activity to open</p>
    </Screen>
  );
}
