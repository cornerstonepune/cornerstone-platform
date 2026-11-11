import Link from "@/components/link";
import { stateWords } from "@/lib/fortnight-words";
import type { PlanRow } from "@/lib/timetable-ui";
import { dateWords } from "@/lib/week";

// The coordinator's two sections above the grid (issue #691, Nimish 11 Nov): Live, the fortnight educators see (or a plain line
// that nothing is), and Planning, every fortnight not live yet, each with its state, its lessons placed for this class and a link
// to its grid, beside the tools that change a plan. Only links: nothing here changes a fortnight or puts one live.
export function PlanSections({ rows, on, shown, grid }: { rows: PlanRow[]; on: boolean; shown: number; grid: (n: number) => string }) {
  const live = on ? rows.filter((r) => r.live) : [];
  const planning = rows.filter((r) => !live.includes(r));
  const span = (r: PlanRow) => `${dateWords(r.starts_on)} to ${dateWords(r.ends_on)}`;
  const lessons = (n: number) => `${n} lesson${n === 1 ? "" : "s"} placed`;
  return (
    <div className="mb-4 grid gap-4">
      <section aria-labelledby="tt-live" data-section="live">
        <h2 id="tt-live" className="tt-h">Live</h2>
        {live.length ? (
          <ul className="tt-list">
            {live.map((r) => (
              <li key={r.id} data-live-fortnight={r.number}>
                <strong>Fortnight {r.number}</strong>, {span(r)}: educators see it. <Link href={grid(r.number)}>{r.number === shown ? "Shown below" : "Open its grid"}</Link>
              </li>
            ))}
          </ul>
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
          <Link href="/timetable/rules">Timetable rules</Link>. Every fortnight below is read-only here.
        </p>
        {planning.length ? (
          <ul className="tt-list">
            {planning.map((r) => (
              <li key={r.id} data-planning-fortnight={r.number} aria-current={r.number === shown ? "true" : undefined}>
                <strong>Fortnight {r.number}</strong> · {stateWords(r.state)}: not live yet · {span(r)} · {lessons(r.lessons)} ·{" "}
                {r.number === shown ? <span>shown below</span> : <Link href={grid(r.number)}>Open its grid</Link>} ·{" "}
                <Link href={`/timetable/fortnight/${r.number}`}>Fortnight {r.number}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tt-note">Every fortnight of the year is live.</p>
        )}
      </section>
    </div>
  );
}
