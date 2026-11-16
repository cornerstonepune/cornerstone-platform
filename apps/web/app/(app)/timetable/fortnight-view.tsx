import type { ReactNode } from "react";
import type { Opened } from "@/components/detail-panel";
import { FortnightGrid } from "@/components/fortnight-grid";
import { StatusChip } from "@/components/status-chip";
import { sql } from "@/lib/db";
import { shortDate } from "@/lib/educator/clock";
import { draftGrid, draftReads, draftsOf } from "@/lib/timetable-draft";
import type { gridOf } from "@/lib/timetable-grid";
import type { Clash, Fn, Move } from "@/lib/timetable-ui";
import { dateWords } from "@/lib/week";
import { fortnightPanel } from "./fortnight-panel";

// The Fortnight view of the timetable (Nimish, 16 Nov 2026: one place, Day / Week / Fortnight inside it). What the fortnight page did and
// the draft page did is read here for the one page: the fortnight's state and next step, Go live, the conflicts, the moves by hand, the
// draft from the rules and its grid. The engine decides every step; nothing is checked here.
type Klass = { id: string; grade: string; section: string };
type Placed = ReturnType<typeof gridOf>["placed"];
type Cell = { day: string; periodId: string };

/** The lesson the coordinator chose to move (`from=day~period`) and the one to swap it with (`to=`), when each is a period of the class's grade. */
export async function moveChoice(klass: Klass, q: { from?: string; to?: string }) {
  const ords = new Map((await sql<{ id: string; ord: number }[]>`select id, ord from period where grade_code = ${klass.grade}`).map((p) => [p.id, p.ord]));
  const [fromDay, fromPeriod] = (q.from ?? "").split("~");
  const [toDay, toPeriod] = (q.to ?? "").split("~");
  const chosen: Cell | null = fromDay && ords.has(fromPeriod) ? { day: fromDay, periodId: fromPeriod } : null;
  const to: Cell | null = chosen && toDay && ords.has(toPeriod) && !(toDay === fromDay && toPeriod === fromPeriod) ? { day: toDay, periodId: toPeriod } : null;
  return { ords, chosen, to };
}

/** The fortnight's own panel, for the right side while no lesson is open. */
export async function fortnightSide(x: {
  fn: Fn; klass: Klass; coordinator: boolean; today: string; on: boolean;
  clashes: Clash[]; moves: Move[]; placed: Placed; tab?: string; stay: (extra?: Record<string, string>) => string;
  move: Awaited<ReturnType<typeof moveChoice>>;
}): Promise<Opened> {
  const { fn, klass, coordinator } = x;
  const started = fn.starts_on <= x.today;
  const [{ placedDrafts }] = await sql<{ placedDrafts: number }[]>`select count(distinct school_class_id)::int as "placedDrafts" from timetable_run where fortnight_id = ${fn.id} and outcome = 'placed'`;
  const subjects = Object.fromEntries((await sql<{ code: string; name: string }[]>`select code, coalesce(label, name) as name from subject`).map((r) => [r.code, r.name]));
  const [{ label: yearLabel }] = await sql<{ label: string }[]>`select y.label from fortnight f join academic_year y on y.id = f.academic_year_id where f.id = ${fn.id}`;
  const [drafts, reads] = await Promise.all([coordinator ? draftsOf(fn.id) : Promise.resolve([]), draftReads(klass.id, klass.grade, fn.id)]);
  return fortnightPanel({
    fn, klass, span: `${dateWords(fn.starts_on)} to ${dateWords(fn.ends_on)}`, yearLabel, coordinator, started,
    canGoLive: coordinator && !started && fn.state === "approved" && placedDrafts > 0,
    subjects,
    open: x.clashes.filter((c) => !c.accepted && c.places.some((p) => p.class === klass.id)),
    moves: x.moves.filter((m) => m.class_id === klass.id),
    ords: x.move.ords, chosen: x.move.chosen, to: x.move.to,
    lessonWords: (day, p) => x.placed.find((l) => l.day === day && l.periodId === p)?.cell.activity ?? "a free slot",
    drafts, reads, stay: x.stay, tab: x.tab,
  });
}

/** The draft from the rules as a grid, read-only (the coordinator's `show=draft`): what the draft page showed, now under the timetable. */
export async function DraftGridView({ fn, classId, cell, at }: { fn: Fn; classId: string; cell?: string; at: (extra: Record<string, string>) => string }): Promise<ReactNode> {
  const drafts = await draftsOf(fn.id);
  const on = drafts.find((d) => d.class_id === classId) ?? drafts[0];
  if (!on) return <p className="tt-note" data-no-draft>No draft made yet for fortnight {fn.number}. Open the Draft tab on the right and press Make a draft.</p>;
  const grid = await draftGrid(on, fn, (day, p) => at({ show: "draft", class: on.class_id, cell: `${day}~${p}` }));
  const [cellDay, cellPeriod] = (cell ?? "").split("~");
  const entry = on.entries.find((e) => e.date === cellDay && e.period_id === cellPeriod);
  return (
    <>
      <p className="tt-note" data-draft-cells={grid.cells}>
        <StatusChip state={on.unmet.length ? "waiting" : "done"} words={on.unmet.length ? `Drafted with ${on.unmet.length} rule${on.unmet.length === 1 ? "" : "s"} not met` : "Drafted, every rule met"} round />{" "}
        {on.label}: {on.placed} of {on.needed} lessons placed ({on.outcome === "placed" ? "all placed" : on.outcome === "unmeetable" ? "the rules cannot all be met" : "no timetable found in time"}) · made {dateWords(on.at.slice(0, 10))}. This is the draft, not the live timetable.
      </p>
      <FortnightGrid days={grid.labels} rows={grid.rows} />
      {entry ? <p className="tt-note" data-draft-cell>{shortDate(entry.date)}: {entry.subject_code} (a draft: it opens read-only).</p> : null}
    </>
  );
}
