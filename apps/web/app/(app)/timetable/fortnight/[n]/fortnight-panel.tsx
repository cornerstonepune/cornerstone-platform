import type { ReactNode } from "react";
import Link from "@/components/link";
import type { Opened, PanelTab } from "@/components/detail-panel";
import { Details } from "@/components/details";
import { KeyValue } from "@/components/key-value";
import { StatusChip } from "@/components/status-chip";
import { Stepper } from "@/components/stepper";
import { nextState, stateWords, steppedFor } from "@/lib/fortnight-words";
import type { Draft } from "@/lib/timetable-draft";
import { dateWords } from "@/lib/week";
import { shortDate } from "@/lib/educator/clock";
import { GoLive } from "./go-live";

// The fortnight's right side (page charter C, "Fortnight (plan, freeze, move)"): the page's own panel, never closed. At its top the
// fortnight's state as the engine names it, as a stepper, with the coordinator's next step (Freeze, Align, Approve) and Go live; below,
// in tabs, the rules in conflict, the moves by hand, the draft from the rules and the rules the draft reads. Every write is the form post it
// was on the page before (the engine decides each and says why when it refuses); nothing is checked here.
const STEP_BUTTON: Record<string, string> = { frozen: "Freeze", aligned: "Align", approved: "Approve" };
const TAP = "inline-flex min-h-[var(--tap)] items-center";

type Clash = { key: string; detail: string };
type Move = { id: string; from: string; to: string; who: string; why: string | null; at: string; undo: boolean };
type Cell = { day: string; periodId: string };
export type FortnightPanelIn = {
  fn: { id: string; number: number; state: string };
  klass: { id: string; grade: string; section: string };
  span: string;
  yearLabel: string;
  coordinator: boolean;
  started: boolean;
  canGoLive: boolean;
  subjects: Record<string, string>;
  open: Clash[];
  moves: Move[];
  chosen: Cell | null;
  to: Cell | null;
  ords: Map<string, number>;
  lessonWords: (day: string, periodId: string) => string;
  drafts: Draft[];
  reads: { label: string; value: string; num: boolean }[];
  /** The fortnight page's address for this class, with the tab (and any other parameters) given. */
  stay: (extra?: Record<string, string>) => string;
  tab?: string;
};

const hidden = (k: string, v: string | number | undefined) => <input type="hidden" name={k} value={v} />;

export function fortnightPanel(x: FortnightPanelIn): Opened {
  const { fn, klass, coordinator, started } = x;
  const next = nextState(fn.state);
  const year = (
    <>
      {hidden("grade", klass.grade)}
      {hidden("section", klass.section)}
      {hidden("year", x.yearLabel)}
    </>
  );
  // the state, always in view: the steps, the coordinator's next one, and Go live once approved
  const state: ReactNode = (
    <div className="grid w-full gap-[var(--space-2)]" data-panel-state>
      <Stepper steps={steppedFor(fn.state)} label="Where this fortnight is" />
      {coordinator && !started && next && STEP_BUTTON[next] ? (
        <form action="/api/timetable/fortnight" method="post" aria-label={`${STEP_BUTTON[next]} this fortnight`} className="contents">
          {hidden("fortnight_id", fn.id)}
          {hidden("to_state", next)}
          {hidden("back", x.stay())}
          <button className="btn justify-self-start" data-ux="action" data-step-button={next}>
            {STEP_BUTTON[next]}
          </button>
        </form>
      ) : null}
      {coordinator && started ? (
        <p className="tt-note" data-frozen>
          This fortnight has started: it is frozen. A move now is a hand move, kept with who made it and why.
        </p>
      ) : null}
      {coordinator ? <GoLive number={fn.number} span={x.span} subjects={x.subjects} can={x.canGoLive} /> : null}
    </div>
  );

  const conflicts = x.open.length ? (
    <ul className="tt-list" data-section="clashes" aria-label="Rules in conflict">
      {x.open.map((c) => (
        <li key={c.key} data-clash={c.key} className="tt-clash">
          <strong className="grow">{c.detail}</strong>
          {coordinator ? (
            <form action="/api/timetable/clash" method="post" className="tt-form" aria-label={`Accept: ${c.detail}`}>
              {hidden("back", x.stay({ tab: "conflicts" }))}
              {hidden("key", c.key)}
              <label>
                Reason
                <input name="reason" />
              </label>
              <span className="tt-note">Left empty, the form says “Say why” and accepts nothing.</span>
              <button className="btn secondary">Accept the clash</button>
            </form>
          ) : (
            <span className="tt-note">Only the coordinator accepts a clash.</span>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p className="tt-note" data-no-clash>
      No rule is in conflict for {klass.grade} {klass.section} in this fortnight.
    </p>
  );

  const last = x.moves[0];
  const [lastFrom, lastTo] = last ? [last.from.split(" "), last.to.split(" ")] : [[], []];
  const moves = (
    <>
      {coordinator && x.chosen && !x.to ? (
        <p className="tt-note" data-move-waiting>
          Chosen: {x.lessonWords(x.chosen.day, x.chosen.periodId)}, {shortDate(x.chosen.day)}. Now choose the lesson, or the free slot, to swap it with in the grid.{" "}
          <Link href={x.stay({ tab: "moves" })} className={TAP}>Cancel</Link>
        </p>
      ) : null}
      {coordinator && !x.chosen ? <p className="tt-note">Choose a lesson in the grid to move it, then the lesson or free slot to swap it with.</p> : null}
      {coordinator && x.chosen && x.to ? (
        <form action="/api/timetable/move" method="post" className="tt-form" aria-label="Make this move" data-move-form>
          {hidden("back", x.stay({ tab: "moves" }))}
          {year}
          {hidden("from_date", x.chosen.day)}
          {hidden("from_period", x.ords.get(x.chosen.periodId))}
          {hidden("to_date", x.to.day)}
          {hidden("to_period", x.ords.get(x.to.periodId))}
          <label>
            Reason
            <input name="reason" />
          </label>
          <button className="btn" data-ux="action">
            Move {x.lessonWords(x.chosen.day, x.chosen.periodId)} ({shortDate(x.chosen.day)}) to {shortDate(x.to.day)}
          </button>
          <Link href={x.stay({ tab: "moves" })} className={TAP}>Cancel</Link>
        </form>
      ) : null}
      {coordinator && last && !last.undo ? (
        <form action="/api/timetable/move" method="post" className="tt-form" aria-label="Undo the last move">
          {hidden("back", x.stay({ tab: "moves" }))}
          {year}
          {hidden("from_date", lastTo[0])}
          {hidden("from_period", x.ords.get(lastTo[1]))}
          {hidden("to_date", lastFrom[0])}
          {hidden("to_period", x.ords.get(lastFrom[1]))}
          {hidden("reason", `Undo of the move on ${last.at.slice(0, 10)}`)}
          <button className="btn secondary">Undo the last move</button>
        </form>
      ) : null}
      {x.moves.length ? (
        <Details summary={`Moved by hand (${x.moves.length})`} id="moved" open>
          <ul className="tt-list">
            {x.moves.map((m) => (
              <li key={m.id} data-hand-move>
                <strong>{m.undo ? "Undone" : "Moved"}</strong>, {dateWords(m.from.split(" ")[0])} to {dateWords(m.to.split(" ")[0])}: {m.who}, {dateWords(m.at.slice(0, 10))}
                {m.why ? `, because ${m.why}` : ""}
              </li>
            ))}
          </ul>
        </Details>
      ) : (
        <p className="tt-note">No lesson of this class was moved by hand in this fortnight.</p>
      )}
    </>
  );

  // the draft from the rules (the coordinator's): one button drafts every class of the year for this fortnight; the latest draft of each
  // class is read back as it was kept, and this class's unmet rules are named in words
  const mine = x.drafts.find((d) => d.class_id === klass.id);
  const draft = (
    <>
      {!started ? (
        <form action="/api/timetable/generate" method="post" className="tt-form" aria-label="Make a draft" data-make-draft>
          {hidden("year", x.yearLabel)}
          {hidden("fortnight", fn.number)}
          {hidden("back", x.stay({ tab: "draft" }))}
          <span className="tt-note">A draft for every class, from the period times, blocked days, fixed slots and limits. It never touches the lessons until Go live.</span>
          <button className="btn" data-ux="action">
            Make a draft
          </button>
        </form>
      ) : (
        <p className="tt-note">This fortnight has started: a new draft is made for a fortnight still to come.</p>
      )}
      {x.drafts.length ? (
        <ul className="tt-list" aria-label="Last drafts by class">
          {x.drafts.map((d) => (
            <li key={d.class_id} data-draft={d.class_id}>
              <strong className="grow">{d.label}</strong>
              <span className="tt-note">
                {d.placed} of {d.needed} placed · {dateWords(d.at.slice(0, 10))}
              </span>
              <StatusChip state={d.outcome === "placed" ? "done" : "waiting"} words={d.outcome === "placed" ? "All placed" : d.outcome === "unmeetable" ? "Rules not all met" : "None found in time"} compact round />
            </li>
          ))}
        </ul>
      ) : (
        <p className="tt-note">No draft made yet for Fortnight {fn.number}.</p>
      )}
      {mine?.unmet.length ? (
        <section aria-label="Rules not met" className="grid gap-[var(--space-1)]">
          <h3 className="b-label b-muted">Rules not met for {mine.label}</h3>
          <ul className="list-disc pl-[var(--space-4)]" data-unmet>
            {mine.unmet.map((r) => (
              <li key={r.id}>{r.exists ? <Link href={`/timetable/rules?class=${klass.id}`} className={TAP}>{r.words}</Link> : r.words}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <Link href={`/timetable/draft?fn=${fn.number}&class=${klass.id}`} data-draft-full className={TAP}>
        Open the draft as a grid
      </Link>
    </>
  );

  const rules = (
    <>
      <p className="tt-note">What the draft reads for {klass.grade} {klass.section}. A rule a move breaks shows under Conflicts, in the rule&apos;s own words.</p>
      <KeyValue rows={x.reads} />
      {coordinator ? (
        <Link href={`/timetable/rules?class=${klass.id}`} data-rules-link className={TAP}>
          Timetable rules
        </Link>
      ) : null}
    </>
  );

  const tabs: PanelTab[] = [
    { key: "conflicts", label: x.open.length ? `Conflicts (${x.open.length})` : "Conflicts", body: conflicts },
    { key: "moves", label: "Moves", body: moves },
    ...(coordinator ? [{ key: "draft", label: "Draft", body: draft }] : []),
    { key: "rules", label: "Rules", body: rules },
  ];
  // the tab the address names; else the moves while a lesson is chosen, the conflicts while any is open, the moves otherwise
  const tab = tabs.some((t) => t.key === x.tab) ? x.tab : x.chosen ? "moves" : x.open.length ? "conflicts" : "moves";
  return {
    key: `fortnight:${fn.number}`,
    kind: "period",
    title: `Fortnight ${fn.number}`,
    line: `${stateWords(fn.state)} · ${klass.grade} ${klass.section}`,
    actions: state,
    tabs,
    tab,
  };
}
