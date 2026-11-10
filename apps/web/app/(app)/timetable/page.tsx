import { notFound } from "next/navigation";
import { Rail, Screen } from "@/components/app-frame";
import { Cards } from "@/components/cards";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { FortnightGrid } from "@/components/fortnight-grid";
import { ViewToggle } from "@/components/kanban-board";
import { requireStaff } from "@/lib/auth";
import { shortDate } from "@/lib/educator/clock";
import { weekOf } from "@/lib/educator/data";
import { isDay } from "@/lib/educator/period";
import { dateWords } from "@/lib/week";
import { stateWords } from "@/lib/fortnight-words";
import { gridOf, moveInto } from "@/lib/timetable-grid";
import { clashesOf, fortnightAfter, fortnightAt, isCoordinator, movesOf } from "@/lib/timetable-ui";
import { schoolToday } from "@/lib/voice-page";
import "./timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable";
const VIEWS = ["day", "week", "fortnight"] as const;
type View = (typeof VIEWS)[number];
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The timetable: the fortnight is the unit. Week A and week B, each period a block; a moved period is marked with who and why,
// and a clash is red until the coordinator accepts it (docs/frontend/SPEC.md, Timetable). The sessions are the engine's
// (/timetable/week: it keeps the educator.timetable_enabled gate, so while that is off this page is not found, as before).
export default async function TimetablePage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const today = await schoolToday();
  if (q.day !== undefined && !isDay(q.day)) notFound();
  const here = await fortnightAt(today);
  const fn = q.when === "next" && here ? await fortnightAfter(here) : here;
  const view: View = (VIEWS as readonly string[]).includes(q.view ?? "") ? (q.view as View) : "fortnight";
  const keep = (extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: q.class, when: q.when, view, ...extra })) if (v) p.set(k, v);
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
  const grid = gridOf(weeks, { days: shown, clashes, href: (day, p) => `/educator/period/${p}?class=${klass.id}&day=${day}` });
  const lessons = grid.rows.some((r) => "cells" in r && r.cells.some((c) => c));
  const movedHere = grid.days.flatMap((day, i) =>
    grid.rows.flatMap((r) => ("cells" in r ? [{ day, cell: r.cells[i], row: r }] : [])).filter((x) => x.cell?.moved).map((x) => ({ ...x, move: moveInto(moves, day, x.cell!.href.split("/period/")[1].split("?")[0]) })),
  );
  const open = clashes.filter((c) => !c.accepted).length;

  return (
    <Screen
      stage={`${klass.grade} ${klass.section}`}
      title="Timetable"
      purpose="The fortnight is the unit. Week A and week B, each period a block; a moved period is marked, a clash is red until the coordinator accepts it."
      action={<a className="btn" href={`/educator?class=${klass.id}&day=${today}`} data-ux="action">Open today</a>}
      next={{ href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}` }}
      rail={
        <Rail
          edges={[
            { screen: "fortnight", params: { n: String(fn.number) }, label: `Fortnight ${fn.number}`, icon: "fortnight" },
            { screen: "materials", label: "Materials, this fortnight", icon: "activity" },
            { screen: "period", params: { id: "today" }, label: "Today’s period", icon: "period" },
            ...(coordinator ? [{ screen: "rules", label: "Timetable rules", icon: "setup" as const }] : []),
          ]}
        />
      }
    >
      <FilterBar
        action={HERE}
        keep={{ view, day: q.day }}
        filters={[
          ...(coordinator ? [{ name: "class", label: "Class", value: klass.id, required: true, all: "", options: weeks[0].classes.map((c) => [c.id, `${c.grade} ${c.section}`] as const) }] : []),
          { name: "when", label: "Fortnight", value: q.when === "next" ? "next" : "this", required: true, all: "", options: [["this", "This fortnight"], ["next", "Next fortnight"]] as const },
        ]}
      />
      <div className="mb-3">
        <ViewToggle
          current={view}
          views={[
            { key: "day", label: "Day", icon: "today", href: keep({ view: "day" }) },
            { key: "week", label: "Week", icon: "week", href: keep({ view: "week" }) },
            { key: "fortnight", label: "Fortnight", icon: "fortnight", href: keep({ view: "fortnight" }) },
          ]}
        />
      </div>
      {open ? <p className="tt-note" data-clashes={open}>{open} clash{open === 1 ? "" : "es"} not accepted yet: red below.</p> : null}
      {lessons ? (
        <div data-view={view} data-day-count={grid.days.length}>
          <FortnightGrid days={grid.labels} today={shortDate(today)} rows={grid.rows} />
        </div>
      ) : (
        <EmptyState next={coordinator ? { href: "/timetable/draft", label: "Make a draft" } : undefined}>No timetable live for this class: nothing is placed in these days.</EmptyState>
      )}
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
    </Screen>
  );
}
