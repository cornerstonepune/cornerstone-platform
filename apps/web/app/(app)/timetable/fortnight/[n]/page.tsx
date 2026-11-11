import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { Stepper } from "@/components/stepper";
import { requireStaff } from "@/lib/auth";
import { dateWords } from "@/lib/week";
import { nextState, steppedFor, stateWords } from "@/lib/fortnight-words";
import { screenHref } from "@/lib/built";
import { fortnightNumber, isCoordinator, movesOf, planOf, stepsTaken } from "@/lib/timetable-ui";
import { schoolToday } from "@/lib/voice-page";
import { sql } from "@/lib/db";
import { GoLive } from "./go-live";
import "../../timetable.css";

type Props = { params: Promise<{ n: string }>; searchParams: Promise<Record<string, string | undefined>> };
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
  const [coordinator, today, took, plan, moves] = await Promise.all([isCoordinator(), schoolToday(), stepsTaken(fn.id), planOf(fn.id), movesOf(fn.id)]);
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
    { screen: "timetable", label: "The grid", icon: "week" },
    ...lines.map((a) => ({ screen: "activity", params: { code: a.code }, label: a.name, icon: "activity" as const })),
    { screen: "materials", label: "Materials, this fortnight", icon: "activity" },
    ...(coordinator ? [{ screen: "draft", label: "Draft from the rules", icon: "setup" as const }] : []),
  ];
  return (
    <Screen
      stage={`${dateWords(fn.starts_on)} to ${dateWords(fn.ends_on)}`}
      title={`Fortnight ${fn.number}`}
      purpose="Its state, its plan lines, and the moves made by hand. Frozen once it starts; a move after that is a hand move, kept with who made it."
      next={{ href: "/timetable", label: "Timetable" }}
      rail={<Rail edges={edges} />}
    >
      {q.error ? <p role="alert" className="tt-error">{q.error}</p> : null}
      {q.done ? <p role="status" className="tt-note">Done.</p> : null}
      <Stepper steps={steppedFor(fn.state)} label="Where this fortnight is" />
      <section className="tt-card" aria-labelledby="h-state" data-card="state">
        <h2 id="h-state">State</h2>
        <p>
          <strong data-state={fn.state}>{stateWords(fn.state)}</strong>
          {last ? <> · {last.who}, {dateWords(last.at.slice(0, 10))}</> : null}
        </p>
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
      </section>
      {coordinator ? <GoLive number={fn.number} subjects={subjects} can={canGoLive} /> : null}
      <section className="tt-card" aria-labelledby="h-plan" data-card="plan">
        <h2 id="h-plan">Plan lines</h2>
        {plan.length === 0 ? (
          <EmptyState>No plan lines yet.</EmptyState>
        ) : (
          <ul className="tt-list">
            {plan.map((l) => (
              <li key={l.id} data-plan-line>
                <span className="grow">{l.class_label}{l.week ? ` · week ${l.week}` : ""}: {l.text}</span>
                {l.activity ? <Link href={activityHref(l.activity.code)}>{l.activity.name}</Link> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="tt-card" aria-labelledby="h-moves" data-card="moves">
        <h2 id="h-moves">Hand moves</h2>
        {moves.length === 0 ? (
          <p className="tt-empty">No hand moves.</p>
        ) : (
          <ul className="tt-list">
            {moves.map((m) => (
              <li key={m.id} data-hand-move>
                {coordinator ? <Link href="/timetable/moves">{m.who}</Link> : m.who}, {dateWords(m.at.slice(0, 10))}{m.why ? `: ${m.why}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Details summary="Who took each step" id="steps">
        <ul className="tt-list">
          {took.length === 0 ? <li>No step taken yet.</li> : took.map((t) => <li key={t.step}>{stateWords(({ freeze: "frozen", align: "aligned", approve: "approved", list_sent: "list_sent" } as Record<string, string>)[t.step] ?? t.step)}: {t.who}, {dateWords(t.at.slice(0, 10))}</li>)}
        </ul>
      </Details>
    </Screen>
  );
}
