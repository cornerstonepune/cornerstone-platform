import Link from "@/components/link";
import { Details } from "@/components/details";
import type { PanelTab } from "@/components/panel-tabs";
import { PeekChip, PeekHost } from "@/components/peek-names";
import { StackBar } from "@/components/stack-bar";
import { OUTCOME_ORDER, outcomeWords } from "@/components/outcome-states";
import { SubjectTag } from "@/components/subject-tag";
import type { Session } from "@/lib/auth";
import { classRolls, lessonActivity, lessonOffers, pageOf, periodOf } from "@/lib/educator/data";
import { childrenByIds, rosterOf } from "@/lib/notes-loop";
import { levelTone } from "@/lib/scale";
import { isCoordinator } from "@/lib/timetable-ui";
import { lastTime, mayRead, sessionAt, sessionOf } from "@/lib/period";
import { myVoice, voiceOn } from "@/lib/voice";
import { classWords } from "@/lib/voice-types";
import { ChooseActivity } from "./[id]/choose-activity";
import { LessonForm } from "./[id]/lesson-form";

// A lesson in the detail panel (docs/frontend/page-charter.md A2, B4): the tabs Activity · Children · Materials · History, from the same
// engine reads and the same form as the lesson's page (/period/[id]). The coordinator's Move and Choose activity are here, not inside
// the grid's blocks. Nothing is invented: a lesson with no activity says so, and what a tab has no words for says "not written yet".
export type LessonPanelData = { title: string; subtitle: ReactNodeLike; full: string; tabs: PanelTab[]; actions: ReactNodeLike } | null;
type ReactNodeLike = React.ReactNode;

/** `at`: the lesson's place on the page (`<period>~<day>`) and the class; null where the place holds no lesson this person may read. */
export async function lessonPanel(me: Session, o: { classId: string; day: string; periodId: string; move?: string }): Promise<LessonPanelData> {
  const id = await sessionAt(o.classId, o.day, o.periodId);
  const s = id ? await sessionOf(id) : null;
  if (!id || !s || !(await mayRead(me, s.section))) return null;
  const klass = classWords(s);
  const coordinator = await isCoordinator();
  const voice = await voiceOn();
  const mine = voice ? !!(await myVoice(me))?.classes.some((x) => x.id === s.class_id) : false;
  const a = s.activity;
  const lesson = s.kind === "fixed" ? null : await lessonActivity(me, { class_id: s.class_id, day: s.day, period_id: s.period_id }).catch(() => null);
  const full = lesson?.activity ?? null;
  const offers = coordinator && s.kind !== "fixed" ? await lessonOffers(me, id).catch(() => null) : null;
  const rolls = a && mine ? await classRolls(me, s.class_id, s.day).catch(() => []) : [];
  const roster = rolls.length ? await rosterOf(me, s.class_id).catch(() => undefined) : undefined;
  const page = a ? await pageOf(me, a.code).catch(() => null) : null;
  const last = a ? await lastTime(s.class_id, a.code, s.day) : null;
  const planner = (await periodOf(me, { class_id: s.class_id, day: s.day, period_id: s.period_id }).catch(() => null))?.plan_lines ?? [];
  const named = last ? await childrenByIds(me, last.named.flatMap((n) => n.children)) : {};
  const steps = page?.parts.find((p) => p.part === "steps");
  const thinking = page?.parts.find((p) => p.part === "thinking");
  const objective = page?.parts.find((p) => p.part === "objective");
  const choose = coordinator && offers ? <ChooseActivity sessionId={id} offers={offers.activities} current={offers.activity_code} kind={offers.label} /> : null;

  const none = (
    <div className="grid gap-[var(--space-2)]" data-no-activity>
      <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-control)] p-[var(--space-3)] text-[var(--ink-muted)]">
        {s.kind === "fixed" ? "A fixed part of the day: nothing to record here." : `This lesson has no activity yet.${offers?.label ? ` It is a ${offers.label} lesson.` : ""}`}
      </p>
      {s.kind !== "fixed" && !coordinator ? <p className="b-caption">The coordinator chooses a lesson&apos;s activity.</p> : null}
      {choose}
    </div>
  );
  const tabs: PanelTab[] = a
    ? [
        {
          key: "activity",
          label: "Activity",
          body: (
            <>
              <p data-part="outcome" className="whitespace-pre-line">{full?.outcome || objective?.text || "What this activity is for is not written yet."}</p>
              <section aria-label="Steps">
                <h3 className="b-psub">Steps</h3>
                {steps?.items.length ? <ol className="list-decimal pl-5">{steps.items.map((i) => <li key={i}>{i}</li>)}</ol> : <p className="whitespace-pre-line">{steps?.text || full?.steps || "No steps written yet."}</p>}
              </section>
              <section aria-label="Watch for">
                <h3 className="b-psub">Watch for</h3>
                <p>{thinking?.text || "Nothing written yet."}</p>
              </section>
              <section aria-label="The four levels" data-part="levels">
                <h3 className="b-psub">The four levels</h3>
                {full?.levels.some(Boolean) ? (
                  <ol start={0} className="grid gap-[var(--space-1)]">
                    {full.levels.map((w, n) => (w ? <li key={n} className="b-lvl" data-state={levelTone(n)}><b>{n}</b><span>{w}</span></li> : null))}
                  </ol>
                ) : (
                  <p>The four levels are not written for this activity.</p>
                )}
              </section>
              <section aria-label="Objectives and skills" data-part="objectives">
                <h3 className="b-psub">Objectives and skills</h3>
                <ul className="list-disc pl-5">
                  {(full?.objectives ?? []).map((o) => <li key={o}>{o}</li>)}
                  {(full?.skills ?? []).map((k) => <li key={k}>{k}</li>)}
                  {!full?.objectives.length && !full?.skills.length ? <li className="list-none">None written for this activity.</li> : null}
                </ul>
              </section>
              {planner.length ? (
                <section aria-label="The planner's lines" data-part="planner">
                  <h3 className="b-psub">The planner&apos;s lines</h3>
                  <ul className="list-disc pl-5">{planner.map((l) => <li key={l}>{l}</li>)}</ul>
                </section>
              ) : null}
              {choose ? <Details summary="Choose another activity" id="choose">{choose}</Details> : null}
            </>
          ),
        },
        {
          key: "children",
          label: "Children",
          body:
            mine && rolls.length ? (
              <div data-part="lesson-form">
                <LessonForm rolls={rolls} roster={roster} levels={full?.levels ?? ["", "", "", ""]} klass={klass} sessionId={id} classId={s.class_id} day={s.day} />
              </div>
            ) : (
              <p className="text-[var(--ink-muted)]">{voice ? "Marking is for the class's own educator." : "Marking is off while voice notes are off."}</p>
            ),
        },
        {
          key: "materials",
          label: "Materials",
          body: page?.materials.items.length ? (
            <ul className="list-disc pl-5" data-part="materials">
              {page.materials.items.map((m) => (
                <li key={m.name}>
                  {m.name}
                  {m.quantity ? ` · ${m.quantity}${m.unit ? ` ${m.unit}` : ""}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-line">{page?.materials.text || full?.materials_text || "Nothing listed."}</p>
          ),
        },
        {
          key: "history",
          label: "History",
          body: last ? (
            <PeekHost>
              <section aria-label="Last time this ran" data-part="history" className="grid gap-[var(--space-2)]">
                <h3 className="b-psub">Last time this ran, {last.day}</h3>
                <StackBar parts={OUTCOME_ORDER.map(([k, state]) => ({ state, n: last.counts[k] ?? 0, words: outcomeWords(k) }))} />
                {last.named.map((n) =>
                  n.children.length ? (
                    <div key={n.outcome} className="grid gap-1" data-named={n.outcome}>
                      <span className="b-psub">{outcomeWords(n.outcome)}</span>
                      <ul className="b-nchips">
                        {n.children.flatMap((cid) => (named[cid] ? [<li key={cid}><PeekChip kid={{ ...named[cid], href: `/children/${named[cid].classId}/${Number(named[cid].no)}`, classId: named[cid].classId, roll: String(Number(named[cid].no)) }} /></li>] : []))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </section>
            </PeekHost>
          ) : (
            <p className="text-[var(--ink-muted)]" data-part="history">Not run with this class yet.</p>
          ),
        },
      ]
    : [{ key: "activity", label: "Activity", body: none }];
  return {
    title: a?.name ?? (s.text || "A fixed part of the day"),
    subtitle: (
      <span className="inline-flex flex-wrap items-center gap-[var(--space-2)]">
        {s.starts_at}
        {s.ends_at ? `–${s.ends_at}` : ""} · {klass}
        {s.subject ? <SubjectTag code={s.subject} /> : null}
      </span>
    ),
    full: `/period/${id}`,
    tabs,
    actions: coordinator && o.move ? <Link href={o.move} data-panel-move>Move this lesson</Link> : null,
  };
}
