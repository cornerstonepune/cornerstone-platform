import type { ReactNode } from "react";
import Link from "@/components/link";
import type { Opened } from "./detail-panel";
import { StackBar } from "./stack-bar";
import { StatusChip } from "./status-chip";
import { OUTCOME_ORDER, outcomeWords } from "./outcome-states";
import type { LessonView } from "@/lib/lesson-view";
import { scaleLook, levelState } from "@/lib/state-scale";
import { ChooseActivity } from "@/app/(app)/period/[id]/choose-activity";
import { EditLesson } from "@/app/(app)/period/[id]/edit-lesson";
import { LessonForm } from "@/app/(app)/period/[id]/lesson-form";

// The lesson in the detail panel (page charter A2 and B4): the tabs every lesson has, Activity · Children · Materials · History, read from
// the same lesson the lesson page reads (lib/lesson-view.ts) and the class form of that page (#715). The coordinator's Move, Edit and Choose
// an activity sit at the top of the panel, never inside the timetable's blocks. Words of the levels are the activity's own; their colours
// are the site's one state scale. Names only where the lesson page already shows them (the class's own educator's roster).
const NOT_WRITTEN = "Not written";
const H = "text-[length:var(--text-label)] font-semibold text-[var(--ink-muted)] uppercase tracking-[0.08em]";

export function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-[var(--space-1)]" aria-label={title}>
      <h3 className={H}>{title}</h3>
      {children}
    </section>
  );
}

/** What the activity is for, in a line (the activity's page part, or the engine's outcome). */
export const OutcomePart = ({ v }: { v: LessonView }) => (
  <Part title="What it is for">
    <p data-part="outcome">{v.objective?.text || v.full?.outcome || "Not written yet."}</p>
  </Part>
);

/** The steps as numbered bullets when the page part has them, else the school's text as written. */
export const StepsPart = ({ v }: { v: LessonView }) => (
  <Part title="The steps">
    {v.steps?.items.length ? (
      <ol className="list-decimal pl-[var(--space-4)]" data-part="steps">
        {v.steps.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ol>
    ) : (
      <p className="whitespace-pre-line">{v.steps?.text || v.full?.steps || "No steps written yet."}</p>
    )}
  </Part>
);

export const WatchPart = ({ v }: { v: LessonView }) => (
  <Part title="Watch for">
    <p>{v.thinking?.text || "Nothing written yet."}</p>
  </Part>
);

/** The rubric: each level a row in the state scale's colour with the activity's own words; a level with none says "Not written". */
export function RubricRows({ levels }: { levels: readonly string[] }) {
  if (!levels.some(Boolean)) return <p>The levels are not written for this activity.</p>;
  return (
    <ol className="b-levels" data-block="Rubric" data-part="levels">
      {levels.map((w, n) => (
        <li key={n} className="b-level" data-level={n} data-state={scaleLook(levelState(n, levels.length))}>
          <b className="b-num">{n}</b>
          <span>{w || NOT_WRITTEN}</span>
        </li>
      ))}
    </ol>
  );
}

/** What to lay out: the page part's items with their quantities, else the school's text. */
export const MaterialsPart = ({ v }: { v: LessonView }) =>
  v.page?.materials.items.length ? (
    <ul className="list-disc pl-[var(--space-4)]" data-part="materials">
      {v.page.materials.items.map((m) => (
        <li key={m.name}>
          {m.name}
          {m.quantity ? ` · ${m.quantity}${m.unit ? ` ${m.unit}` : ""}` : ""}
        </li>
      ))}
    </ul>
  ) : (
    <p className="whitespace-pre-line">{v.page?.materials.text || v.full?.materials_text || "Nothing listed."}</p>
  );

/** The last time this class did the activity: its day and how many children showed what. */
export const LastTimePart = ({ v, after }: { v: LessonView; after?: ReactNode }) => (
  <Part title={v.last ? `Last time this class did it, ${v.last.day}` : "Last time this class did it"}>
    {v.last ? <StackBar parts={OUTCOME_ORDER.map(([k, state]) => ({ state, n: v.last!.counts[k] ?? 0, words: outcomeWords(k) }))} /> : <p className="text-[var(--ink-muted)]">Not run with this class yet.</p>}
    {after}
  </Part>
);

/** The lesson as the panel opens it. `move`: the coordinator's address for choosing this lesson to move; `moved`: who moved it and why. */
export function lessonPanel(v: LessonView, o: { key: string; closeHref: string; tab?: string; move?: string; moved?: string; clash?: string }): Opened {
  const { s, a, full, offers, coordinator, mine, rolls, roster, klass, planner } = v;
  const levels = full?.levels ?? [];
  const activity = a ? (
    <>
      <OutcomePart v={v} />
      <StepsPart v={v} />
      <WatchPart v={v} />
      <Part title="The rubric">
        <RubricRows levels={levels} />
      </Part>
      {planner.length ? (
        <Part title="The planner's lines">
          <ul className="list-disc pl-[var(--space-4)]" data-part="planner">
            {planner.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Part>
      ) : null}
    </>
  ) : (
    <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-control)] p-[var(--space-3)] text-[var(--ink-muted)]" data-no-activity>
      {s.kind === "fixed" ? "A fixed part of the day: nothing to record here." : `This lesson has no activity yet.${offers?.label ? ` It is a ${offers.label} lesson.` : ""} ${coordinator ? "Choose one above." : "The coordinator chooses a lesson's activity."}`}
    </p>
  );
  const children =
    a && mine && rolls.length ? (
      <div data-part="lesson-form">
        <LessonForm rolls={rolls} roster={roster} levels={levels.length ? levels : ["", "", "", ""]} klass={klass} sessionId={s.id} classId={s.class_id} day={s.day} />
      </div>
    ) : (
      <p className="text-[var(--ink-muted)]" data-no-form>
        {!a ? "Nothing can be marked until the lesson has an activity." : !v.voice ? "Marking a class is not switched on yet." : "Only this class's own educator marks it here."}
      </p>
    );
  const materials = <MaterialsPart v={v} />;
  const history = (
    <>
      <LastTimePart v={v} />
      {o.moved ? (
        <Part title="Moved">
          <p data-moved-detail>
            <StatusChip state="moved" round /> {o.moved}
          </p>
        </Part>
      ) : null}
      {o.clash ? (
        <Part title="Clash">
          <p data-clash-note>
            <StatusChip state="clash" round /> {o.clash}
          </p>
        </Part>
      ) : null}
    </>
  );
  const actions = coordinator ? (
    <>
      {o.move ? (
        <Link href={o.move} className="btn secondary" data-panel-move>
          Move
        </Link>
      ) : null}
      {s.kind !== "fixed" ? (
        <details data-panel-edit>
          <summary className="btn secondary w-fit cursor-pointer">Edit</summary>
          <div className="mt-[var(--space-2)]">
            <EditLesson sessionId={s.id} text={s.text} />
          </div>
        </details>
      ) : null}
      {offers ? (
        <details data-panel-choose open={!a}>
          <summary className="btn secondary w-fit cursor-pointer">Choose activity</summary>
          <div className="mt-[var(--space-2)]">
            <ChooseActivity sessionId={s.id} offers={offers.activities} current={offers.activity_code} kind={offers.label} />
          </div>
        </details>
      ) : null}
    </>
  ) : undefined;
  return {
    key: o.key,
    kind: "period",
    title: a?.name ?? (s.text || "A fixed part of the day"),
    line: [`${s.starts_at}${s.ends_at ? `–${s.ends_at}` : ""}`, klass, v.period?.name || s.subject].filter(Boolean).join(" · "),
    full: `/period/${s.id}`,
    closeHref: o.closeHref,
    actions,
    tab: o.tab,
    tabs: [
      { key: "activity", label: "Activity", body: activity },
      { key: "children", label: "Children", body: children },
      { key: "materials", label: "Materials", body: materials },
      { key: "history", label: "History", body: history },
    ],
  };
}
