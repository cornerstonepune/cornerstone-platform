import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FortnightGrid } from "@/components/fortnight-grid";
import { KeyValue } from "@/components/key-value";
import { StatusChip } from "@/components/status-chip";
import { ViewToggle } from "@/components/kanban-board";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { shortDate } from "@/lib/educator/clock";
import { weekOf } from "@/lib/educator/data";
import { gridOf } from "@/lib/timetable-grid";
import { subjectLooks, clashesOf, fortnightAfter, fortnightAt, fortnightNumber, isCoordinator, movesOf, type Move } from "@/lib/timetable-ui";
import type { Column } from "@/lib/ux-rules";
import { dateWords } from "@/lib/week";
import { schoolToday } from "@/lib/voice-page";
import "../timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/timetable/moves";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// Moves by hand: pick a lesson, then the lesson to swap it with; the clash it makes shows at once, red. Only the coordinator
// picks, undoes or accepts; an educator reads the same page. Every move is a row (who, why, when) and an undo is a new row.
export default async function MovesPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const today = await schoolToday();
  const here = await fortnightAt(today);
  const upcoming = here && here.starts_on > today ? here : here ? await fortnightAfter(here) : here;
  const fn = (/^\d+$/.test(q.fn ?? "") ? await fortnightNumber(Number(q.fn)) : null) ?? upcoming;
  if (!fn) return <Screen stage="Moves by hand" title="Moves by hand" purpose="No teaching fortnight is set up ahead." next={{ href: "/timetable", label: "Timetable" }}><EmptyState>No moves yet.</EmptyState></Screen>;
  const weeks = await Promise.all([fn.starts_on, addDays(fn.starts_on, 7)].map((w) => weekOf(me, { class_id: q.class, week_of: w })));
  const klass = weeks[0].class;
  const [{ year }] = await sql<{ year: string }[]>`select y.label as year from fortnight f join academic_year y on y.id = f.academic_year_id where f.id = ${fn.id}`;
  const ords = new Map((await sql<{ id: string; ord: number }[]>`select id, ord from period where grade_code = ${klass.grade}`).map((p) => [p.id, p.ord]));
  const [moves, clashes] = await Promise.all([movesOf(fn.id), clashesOf(fn.id)]);
  const mine = moves.filter((m) => m.class_id === klass.id);
  const pick = q.from ?? "";
  const [fromDay, fromPeriod] = pick.split("~");
  const stay = (extra: Record<string, string>) => `${HERE}?${new URLSearchParams({ fn: String(fn.number), class: klass.id, ...extra })}`;
  const grid = gridOf(weeks, { looks: await subjectLooks(),
    clashes,
    href: (day, p) => (!coordinator ? `/period/${p}?class=${klass.id}&day=${day}` : !pick ? stay({ from: `${day}~${p}` }) : stay({ from: pick, to: `${day}~${p}` })),
  });
  const [toDay, toPeriod] = (q.to ?? "").split("~");
  const ready = coordinator && fromDay && toDay && ords.has(fromPeriod) && ords.has(toPeriod);
  const last = mine[0];
  const [lastFrom, lastTo] = last ? [last.from.split(" "), last.to.split(" ")] : [[], []];
  const open = clashes.filter((c) => !c.accepted);
  const columns: Column<Move>[] = [
    { key: "what", label: "What", value: (m) => (m.undo ? "Undo" : "Moved"), width: "6rem" },
    { key: "from", label: "From", value: (m) => dateWords(m.from.split(" ")[0]), width: "8rem" },
    { key: "to", label: "To", value: (m) => dateWords(m.to.split(" ")[0]), width: "8rem" },
    { key: "who", label: "Who", value: (m) => m.who },
    { key: "why", label: "Why", value: (m) => m.why ?? "" },
    { key: "when", label: "When", value: (m) => dateWords(m.at.slice(0, 10)), width: "8rem" },
  ];
  return (
    <Screen
      stage={`Fortnight ${fn.number} · ${klass.grade} ${klass.section}`}
      title="Moves by hand"
      purpose="Move a period; the clash it makes shows at once; only the coordinator accepts one, with a reason."
      next={{ href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}: Approve` }}
      rail={
        <div className="tt-rail">
          <Rail edges={[{ screen: "fortnight", params: { n: String(fn.number) }, href: `/timetable/fortnight/${fn.number}`, label: `Fortnight ${fn.number}`, icon: "fortnight" }, { screen: "timetable", href: `/timetable?fn=${fn.number}&class=${klass.id}`, label: "The grid", icon: "week" }, { screen: "rules", href: "/timetable/rules", label: "Timetable rules", icon: "setup" }]} />
          <aside aria-label="This draft so far" data-rail-part="so-far" className="tt-rail-card">
            <h2 className="tt-rail-h">This draft so far</h2>
            <KeyValue rows={[{ label: "Lessons", value: String(grid.placed.length), num: true }, { label: "Moved by hand", value: String(mine.length), num: true }, { label: "Clashes open", value: String(open.length), num: true }, { label: "Clashes accepted", value: String(clashes.length - open.length), num: true }]} />
          </aside>
        </div>
      }
    >
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.done ? <p role="status" className="tt-note">Done.</p> : null}
      <div className="tt-legend" data-legend>
        <StatusChip state="moved" words="Moved by hand" round />
        <StatusChip state="clash" words="Clash, not yet accepted" round />
        <StatusChip state="done" words="Clash accepted" round />
      </div>
      {coordinator ? <p className="tt-note">{pick ? `Picked ${shortDate(fromDay)}. Now pick the lesson to swap it with.` : "Pick a lesson, then the lesson to swap it with."}</p> : <p className="tt-note">You can read the moves; only the coordinator makes them.</p>}
      <div className="mb-3">
        <ViewToggle current={klass.id} views={weeks[0].classes.map((c) => ({ key: c.id, label: `${c.grade} ${c.section}`, icon: "class" as const, href: stay({ class: c.id }) }))} />
      </div>
      <FortnightGrid days={grid.labels} rows={grid.rows} />
      {ready ? (
        <form action="/api/timetable/move" method="post" className="tt-card tt-row" aria-label="Make this move">
          <input type="hidden" name="back" value={stay({})} />
          <input type="hidden" name="grade" value={klass.grade} /><input type="hidden" name="section" value={klass.section} /><input type="hidden" name="year" value={year} />
          <input type="hidden" name="from_date" value={fromDay} /><input type="hidden" name="from_period" value={ords.get(fromPeriod)} />
          <input type="hidden" name="to_date" value={toDay} /><input type="hidden" name="to_period" value={ords.get(toPeriod)} />
          <label>Reason<input name="reason" /></label>
          <button className="btn">Move {shortDate(fromDay)} to {shortDate(toDay)}</button>
        </form>
      ) : null}
      {coordinator && last && !last.undo ? (
        <form action="/api/timetable/move" method="post" className="tt-row" aria-label="Undo the last move">
          <input type="hidden" name="back" value={stay({})} />
          <input type="hidden" name="grade" value={klass.grade} /><input type="hidden" name="section" value={klass.section} /><input type="hidden" name="year" value={year} />
          <input type="hidden" name="from_date" value={lastTo[0]} /><input type="hidden" name="from_period" value={ords.get(lastTo[1])} />
          <input type="hidden" name="to_date" value={lastFrom[0]} /><input type="hidden" name="to_period" value={ords.get(lastFrom[1])} />
          <input type="hidden" name="reason" value={`Undo of the move on ${last.at.slice(0, 10)}`} />
          <button className="btn secondary">Undo the last move</button>
        </form>
      ) : null}
      {mine.length === 0 ? <EmptyState>No moves yet.</EmptyState> : <DataTable label="Moves made" columns={columns} rows={mine} rowKey={(m) => m.id} more={{ page: 1, href: (n: number) => stay({ page: String(n) }) }} />}
      <h2 className="tt-h">Clashes in Fortnight {fn.number}</h2>
      {open.length === 0 ? <p className="tt-note">No clash waits to be accepted.</p> : (
        <ul className="tt-list">
          {open.map((c) => (
            <li key={c.key} data-clash={c.key} className="tt-clash">
              <strong className="grow">{c.detail}</strong>
              {coordinator ? (
                <form action="/api/timetable/clash" method="post" className="tt-form" aria-label={`Accept: ${c.detail}`}>
                  <input type="hidden" name="back" value={stay({})} /><input type="hidden" name="key" value={c.key} />
                  <label>Reason<input name="reason" /></label>
                  <span className="tt-note">Left empty, the form says “Say why” and accepts nothing.</span>
                  <button className="btn" data-ux="action">Accept the clash</button>
                </form>
              ) : <span className="tt-note">Only the coordinator accepts a clash.</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="tt-note"><Link href="/timetable">Back to the timetable</Link></p>
    </Screen>
  );
}
