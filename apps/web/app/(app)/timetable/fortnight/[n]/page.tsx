import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Cards, type Card } from "@/components/cards";
import { EmptyState } from "@/components/empty-state";
import { KanbanBoard, type Lane } from "@/components/kanban-board";
import { Stepper } from "@/components/stepper";
import { Timeline, type Seen } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { dateWords } from "@/lib/week";
import { FORTNIGHT_STEPS, nextState, steppedFor, stateWords } from "@/lib/fortnight-words";
import { screenHref } from "@/lib/built";
import { fortnightNumber, fortnightsOfYear, isCoordinator, movesOf, planOf, stepsTaken } from "@/lib/timetable-ui";
import { schoolToday } from "@/lib/voice-page";
import { sql } from "@/lib/db";
import { GoLive } from "./go-live";
import "../../timetable.css";

type Props = { params: Promise<{ n: string }>; searchParams: Promise<Record<string, string | undefined>> };
const STEP_STATE: Record<string, string> = { freeze: "frozen", align: "aligned", approve: "approved", list_sent: "list_sent" };
// the lane's colour and icon: a fortnight still being made waits, one that is settled is done
const LANE_STATE = { planning: "waiting", aligned: "waiting", approved: "waiting", frozen: "done", list_sent: "done" } as const;
const activityHref = (code: string) => screenHref("activity", { code }) ?? `/educator/activity/${encodeURIComponent(code)}`;

// A fortnight: its state, its plan lines and the moves made by hand. The coordinator takes the next step with one button
// (Approve) when the fortnight is ready for it. Frozen once it starts: then no step button and nothing to edit.
// Go live (coordinator, once approved) puts every class's placed draft live and lists what each changed (`go-live.tsx`).
export default async function FortnightPage({ params, searchParams }: Props) {
  await requireStaff();
  const { n } = await params;
  const q = await searchParams;
  const fn = /^\d+$/.test(n) ? await fortnightNumber(Number(n)) : null;
  if (!fn) notFound();
  const [coordinator, today, took, plan, moves, year] = await Promise.all([isCoordinator(), schoolToday(), stepsTaken(fn.id), planOf(fn.id), movesOf(fn.id), fortnightsOfYear(fn)]);
  const started = fn.starts_on <= today;
  const next = nextState(fn.state);
  const canApprove = coordinator && !started && fn.state === "aligned";
  // Go live comes after Approve (the fortnight is approved and has not started) and only where some class has a placed draft
  const [{ drafts }] = await sql<{ drafts: number }[]>`select count(distinct school_class_id)::int as drafts from timetable_run where fortnight_id = ${fn.id} and outcome = 'placed'`;
  const canGoLive = coordinator && !started && fn.state === "approved" && drafts > 0;
  const subjects = Object.fromEntries((await sql<{ code: string; name: string }[]>`select code, coalesce(label, name) as name from subject`).map((r) => [r.code, r.name]));
  const last = took.at(-1);
  const lines = [...new Map(plan.filter((l) => l.activity).map((l) => [l.activity!.code, l.activity!])).values()];
  const edges: Edge[] = [
    { screen: "timetable", href: `/timetable?fn=${fn.number}`, label: "The grid", icon: "week" },
    { screen: "materials", label: "Materials, this fortnight", icon: "activity" },
    ...(coordinator ? [{ screen: "draft", href: `/timetable/draft?fn=${fn.number}`, label: "Draft from the rules", icon: "setup" as const }] : []),
  ];
  const planEdges: Edge[] = lines.map((a) => ({ screen: "activity", params: { code: a.code }, href: activityHref(a.code), label: a.name, icon: "activity" as const }));
  const steps: Seen[] = took.map((t) => ({ kind: "note", title: stateWords(STEP_STATE[t.step] ?? t.step), line: t.who, when: dateWords(t.at.slice(0, 10)) }));
  const cards: Card[] = [
    {
      kind: "period",
      title: "State",
      line: stateWords(fn.state),
      body: (
        <div data-card="state" className="tt-card-body">
          {last ? <p className="tt-note">{stateWords(fn.state)} · {last.who}, {dateWords(last.at.slice(0, 10))}</p> : null}
          {steps.length ? <Timeline entries={steps} /> : <p className="tt-empty">No step taken yet.</p>}
          {started ? <p className="tt-note" data-frozen>This fortnight has started: it is frozen. A change now is a hand move, kept with who made it and why.</p> : null}
          {!started && next && !canApprove ? <p className="tt-note">Next step: {stateWords(next)}.</p> : null}
          {canApprove ? (
            <form action="/api/timetable/fortnight" method="post">
              <input type="hidden" name="fortnight_id" value={fn.id} />
              <input type="hidden" name="to_state" value="approved" />
              <input type="hidden" name="back" value={`/timetable/fortnight/${fn.number}`} />
              <button className="btn" data-ux="action">Approve</button>
            </form>
          ) : null}
        </div>
      ),
    },
    {
      kind: "activity",
      title: "Plan lines",
      line: plan.length === 1 ? "1 line" : `${plan.length} lines`,
      body: (
        <div data-card="plan" className="tt-card-body">
          {plan.length === 0 ? (
            <EmptyState>No plan lines yet.</EmptyState>
          ) : (
            <ul className="tt-list">
              {plan.map((l) => (
                <li key={l.id} data-plan-line>
                  <span className="grow">
                    <b>{l.text}</b>
                    <span className="tt-note"> {l.class_label}{l.week ? ` · week ${l.week}` : ""}{l.activity ? <> · <Link href={activityHref(l.activity.code)}>{l.activity.name}</Link></> : null}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
    {
      kind: "note",
      title: "Hand moves",
      line: moves.length === 1 ? "1 move" : `${moves.length} moves`,
      body: (
        <div data-card="moves" className="tt-card-body">
          {moves.length === 0 ? (
            <p className="tt-empty">No hand moves.</p>
          ) : (
            <ul className="tt-list">
              {moves.map((m) => (
                <li key={m.id} data-hand-move>
                  <span className="grow">
                    <b>{m.why ?? "Moved by hand"}</b>
                    <span className="tt-note"> {coordinator ? <Link href={`/timetable/moves?fn=${fn.number}&class=${m.class_id}`}>{m.who}</Link> : m.who}, {dateWords(m.at.slice(0, 10))}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    },
  ];
  const lanes: Lane[] = FORTNIGHT_STEPS.map((st) => {
    const here = year.filter((y) => y.state === st.state);
    return {
      key: st.state,
      label: st.words,
      state: LANE_STATE[st.state],
      count: here.length,
      empty: "None in this state.",
      cards: here.map((y) => ({
        key: y.id,
        kind: "period" as const,
        title: `Fortnight ${y.number}`,
        sub: `${dateWords(y.starts_on)} to ${dateWords(y.ends_on)}${y.moves ? ` · ${y.moves} hand move${y.moves === 1 ? "" : "s"}` : ""}${y.id === fn.id ? " · this page" : ""}`,
        href: `/timetable/fortnight/${y.number}`,
        state: LANE_STATE[st.state],
        note: st.words,
      })),
    };
  });
  return (
    <Screen
      stage={`${dateWords(fn.starts_on)} to ${dateWords(fn.ends_on)}`}
      title={`Fortnight ${fn.number}`}
      purpose="Its state, its plan lines, and the moves made by hand. Frozen once it starts; a move after that is a hand move, kept with who made it."
      next={{ href: "/timetable", label: "Timetable" }}
      rail={<Rail edges={[...edges, ...planEdges]} />}
    >
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.done ? <p role="status" className="tt-note">Done.</p> : null}
      <Stepper steps={steppedFor(fn.state)} label="Where this fortnight is" />
      {coordinator ? <GoLive number={fn.number} span={`${dateWords(fn.starts_on)} to ${dateWords(fn.ends_on)}`} subjects={subjects} can={canGoLive} /> : null}
      <Cards cards={cards} />
      <h2 className="tt-h">Every fortnight of the year, by state</h2>
      <KanbanBoard lanes={lanes} />
    </Screen>
  );
}
