import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { StatusChip } from "@/components/status-chip";
import { liveWords, type PlanRow } from "@/lib/timetable-ui";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";

// The coordinator's two sections above the grid (issue #691, Nimish 11 Nov): Live, the fortnight educators open on (or a plain line
// that nothing is), and Planning, every fortnight still to come that is not live. Each is a table, one row per fortnight: its name (a
// link, and the whole row opens its grid), its dates, its state in words, the lessons placed for this class, and the row's actions
// (Move lessons, Open the fortnight). Only links: nothing here changes a fortnight or puts one live.
type Line = { row: PlanRow; state: string; live: boolean };

export function PlanSections({ rows, on, live, today, shown, classId, grid }: { rows: readonly PlanRow[]; on: boolean; live: Set<string>; today: string; shown: number; classId?: string; grid: (n: number) => string }) {
  const move = (r: PlanRow) => `/timetable/moves?${new URLSearchParams({ fn: String(r.number), ...(classId ? { class: classId } : {}) })}`;
  const columns: Column<Line>[] = [
    {
      key: "fortnight",
      label: "Fortnight",
      width: "11rem",
      value: (l) => `Fortnight ${l.row.number}`,
      // the name is the row's one link to its grid; its box is stretched over the row (timetable.css `.tt-name`), so the whole row opens it
      cell: (l) => (
        <Link href={grid(l.row.number)} className="tt-name font-medium" aria-current={l.row.number === shown ? "true" : undefined}>
          Fortnight {l.row.number}
        </Link>
      ),
    },
    { key: "dates", label: "Dates", value: (l) => `${dateWords(l.row.starts_on)} to ${dateWords(l.row.ends_on)}` },
    { key: "state", label: "State", status: true, value: (l) => l.state, cell: (l) => <StatusChip state={l.live ? "done" : "waiting"} words={l.state} compact round /> },
    { key: "lessons", label: "Lessons placed", num: true, keep: true, width: "9rem", value: (l) => l.row.lessons },
    {
      key: "go",
      label: "",
      width: "20rem",
      value: (l) => String(l.row.number),
      cell: (l) => (
        <span className="tt-actions">
          <Link href={move(l.row)} className="btn secondary" data-move-lessons>Move lessons</Link>
          <Link href={`/timetable/fortnight/${l.row.number}`} className="tt-open">Fortnight {l.row.number}</Link>
        </span>
      ),
    },
  ];
  const lines = (rs: readonly PlanRow[], isLive: boolean): Line[] =>
    rs.map((r) => ({ row: r, live: isLive, state: isLive ? liveWords(r.state, { on: true, live: true, lessons: r.lessons, from: r.starts_on > today ? r.starts_on : undefined }) : liveWords(r.state, { on, live: false, lessons: r.lessons }) }));
  const isLive = lines(rows.filter((r) => live.has(r.id)), true);
  const planning = lines(rows.filter((r) => !live.has(r.id) && r.ends_on >= today), false);
  const table = (label: string, ls: Line[], attr: "data-live-fortnight" | "data-planning-fortnight") => (
    <DataTable label={label} columns={columns} rows={ls} rowKey={(l) => l.row.id} limit={ls.length} more={{ page: 1, href: () => "#" }} extras={{ attrs: (l) => ({ [attr]: String(l.row.number), "data-fortnight-row": "" }) }} />
  );
  return (
    <div className="mb-4 grid gap-4">
      <section aria-labelledby="tt-live" data-section="live">
        <h2 id="tt-live" className="tt-h">Live</h2>
        {isLive.length ? (
          table("Live fortnights", isLive, "data-live-fortnight")
        ) : (
          <p className="tt-note" data-nothing-live>
            Nothing is live yet. Educators see a timetable once the coordinator makes one live from Setup, Fortnight.
          </p>
        )}
      </section>
      <section aria-labelledby="tt-planning" data-section="planning">
        <h2 id="tt-planning" className="tt-h">Planning</h2>
        <p className="tt-note">
          Change a plan with <Link href="/timetable/draft">Draft from the rules</Link>, <Link href="/timetable/moves">Moves by hand</Link> or{" "}
          <Link href="/timetable/rules">Timetable rules</Link>. Moving a lesson in a fortnight past planning asks for a reason.
        </p>
        {planning.length ? table("Fortnights in planning", planning, "data-planning-fortnight") : <p className="tt-note">No fortnight still to come is in planning.</p>}
      </section>
    </div>
  );
}
