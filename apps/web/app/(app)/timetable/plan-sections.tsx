import Link from "@/components/link";
import { liveWords, type PlanRow } from "@/lib/timetable-ui";
import { dateWords } from "@/lib/week";

// The coordinator's two sections above the grid (issue #691, Nimish 11 Nov): Live, the fortnight educators open on (or a plain line
// that nothing is), and Planning, every fortnight still to come that is not live, each with its state, its lessons placed for this
// class, a link to its grid and to Moves by hand on it. Only links: nothing here changes a fortnight or puts one live.
export function PlanSections({ rows, on, live, today, shown, classId, grid }: { rows: readonly PlanRow[]; on: boolean; live: Set<string>; today: string; shown: number; classId?: string; grid: (n: number) => string }) {
  const span = (r: PlanRow) => `${dateWords(r.starts_on)} to ${dateWords(r.ends_on)}`;
  const lessons = (n: number) => `${n} lesson${n === 1 ? "" : "s"} placed`;
  const move = (r: PlanRow) => `/timetable/moves?${new URLSearchParams({ fn: String(r.number), ...(classId ? { class: classId } : {}) })}`;
  const open = (r: PlanRow) => (r.number === shown ? <span>shown below</span> : <Link href={grid(r.number)}>Open its grid</Link>);
  const links = (r: PlanRow) => (
    <>
      {open(r)} · <Link href={move(r)} data-move-lessons>Move lessons</Link> · <Link href={`/timetable/fortnight/${r.number}`}>Fortnight {r.number}</Link>
    </>
  );
  const isLive = rows.filter((r) => live.has(r.id));
  const planning = rows.filter((r) => !live.has(r.id) && r.ends_on >= today);
  return (
    <div className="mb-4 grid gap-4">
      <section aria-labelledby="tt-live" data-section="live">
        <h2 id="tt-live" className="tt-h">Live</h2>
        {isLive.length ? (
          <ul className="tt-list">
            {isLive.map((r) => (
              <li key={r.id} data-live-fortnight={r.number}>
                <strong>Fortnight {r.number}</strong>, {span(r)} · {liveWords(r.state, { on: true, live: true, lessons: r.lessons })} · {lessons(r.lessons)} · {links(r)}
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
          <Link href="/timetable/rules">Timetable rules</Link>. Moving a lesson in a fortnight past planning asks for a reason.
        </p>
        {planning.length ? (
          <ul className="tt-list">
            {planning.map((r) => (
              <li key={r.id} data-planning-fortnight={r.number} aria-current={r.number === shown ? "true" : undefined}>
                <strong>Fortnight {r.number}</strong> · {liveWords(r.state, { on, live: false, lessons: r.lessons })} · {span(r)} · {lessons(r.lessons)} · {links(r)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="tt-note">No fortnight still to come is in planning.</p>
        )}
      </section>
    </div>
  );
}
