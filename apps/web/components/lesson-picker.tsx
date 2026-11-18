"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { Icon } from "@/lib/icons";
import { MachineMark } from "@/components/origin";
import type { OUnit, ORow, Offers } from "@/lib/lesson-picker";
import { pickerChoose, pickerFill, pickerRead, type Planned } from "@/app/(app)/timetable/picker-actions";
import "./lesson-picker.css";

// The picker (CP-74; Nimish, 17 Nov 2026: "If I am choosing a point … I should then be choosing the activity or learning objective for that
// particular period, if I have to"). One block, two places: the lesson panel beside the timetable and the panel beside the Build grid.
// Choosing is optional: a lesson with only its subject is whole, so the block opens on what is next, already selected, and one press of
// Choose takes it; an activity is one more press; Skip leaves the lesson as it is. The order, the tiers and every refusal are the engine's.
// Beside the timetable it folds to one line once the lesson has an objective (`folds`), with Change to open it again.
// Radio rows (the browser's own arrow keys), each at least 44 px high. Nothing here animates: it is opened many times a day.
const KEEP = "keep";
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const taughtOn = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const V = <span className="lp-v" aria-hidden><Icon name="chevron-down" size={16} /></span>;

function Row({ name, o, on, tag, onPick }: { name: string; o: ORow; on: boolean; tag?: string; onPick: (code: string) => void }) {
  const facts = [o.taught_on ? `taught ${taughtOn(o.taught_on)}` : null, o.activities ? `${o.activities} ${o.activities === 1 ? "activity" : "activities"}` : null].filter(Boolean).join(" · ");
  return (
    <label className="lp-row" data-objective={o.code} data-on={on ? "" : undefined} data-taught={o.taught_on ? "" : undefined}>
      <input type="radio" name={name} value={o.code} checked={on} onChange={() => onPick(o.code)} />
      <span className="lp-row-words">
        {tag ? <span className="lp-tag" data-next-up>{tag}</span> : null}
        <span>{o.title}</span>
        {facts ? <span className="lp-facts">{facts}</span> : null}
      </span>
    </label>
  );
}

const unitWords = (u: OUnit) => `${u.unit || "No unit named"} · ${u.done} of ${u.of} taught`;

export function LessonPicker({
  offers: first,
  when,
  coordinator,
  folds,
  onSkip,
  skipHref,
  onSaved,
}: {
  offers: Offers;
  /** The lesson's day in words, where the place that opened the picker has no date of its own (the Build grid). */
  when?: string;
  coordinator: boolean;
  /** Fold to one line (what it teaches, and Change) while the lesson has an objective: beside the timetable, where the lesson's own parts follow. */
  folds?: boolean;
  onSkip?: () => void;
  skipHref?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [offers, setOffers] = useState(first);
  const [sel, setSel] = useState<string | null>(first.lo_code ?? first.next_up?.code ?? null);
  const linkedHas = (o: Offers) => !!o.activity_code && o.activities.some((a) => a.code === o.activity_code);
  const startAct = (o: Offers) => (linkedHas(o) ? o.activity_code! : o.activity_code ? KEEP : "");
  const [act, setAct] = useState(startAct(first));
  const [reason, setReason] = useState("");
  const [said, setSaid] = useState<{ error?: string; done?: string } | null>(null);
  const [plan, setPlan] = useState<{ unit: string; got: Planned } | null>(null);
  const [unit, setUnit] = useState("");
  const [pending, go] = useTransition();
  const asked = useRef(0);
  const now = useRef<HTMLParagraphElement>(null);
  const [reading, setReading] = useState(false);
  const [open, setOpen] = useState(!folds || !first.lo_code);
  // the lesson changed from outside the picker (the panel's own Choose activity, another person): start again from the lesson as it now stands
  const [seen, setSeen] = useState(first);
  if (first !== seen) {
    setSeen(first);
    if (first.lo_code !== offers.lo_code || first.activity_code !== offers.activity_code) {
      setOffers(first);
      setSel(first.lo_code ?? first.next_up?.code ?? null);
      setAct(startAct(first));
    }
  }

  const whole = offers.tiers.find((t) => t.tier === "all");
  const units = whole && whole.tier === "all" ? whole.units : [];
  const near = offers.tiers.filter((t): t is Extract<typeof t, { tier: "rest_of_unit" | "next_unit" }> => t.tier !== "all");
  const nothing = units.every((u) => u.rows.length === 0);
  const needsReason = !!reason || /reason/i.test(said?.error ?? "");

  /** Another objective selected: its own activities are read, and the choice of activity starts again. */
  const pick = (code: string) => {
    setSel(code);
    setSaid(null);
    const mine = ++asked.current;
    setReading(true);
    void pickerRead(offers.session_id, code).then((got) => {
      if (mine !== asked.current) return; // a later row was chosen: its answer is the one to show
      setReading(false);
      if (!got.ok) return setSaid({ error: got.why });
      setOffers(got.data);
      setAct(code === got.data.lo_code ? startAct(got.data) : got.data.activity_code ? KEEP : "");
    });
  };
  const settle = (got: Awaited<ReturnType<typeof pickerChoose>>, words: string) => {
    if (!got.ok) return setSaid({ error: got.why });
    setOffers(got.data);
    setSel(got.data.lo_code ?? got.data.next_up?.code ?? null);
    setAct(startAct(got.data));
    setReason("");
    setSaid({ done: words });
    setOpen(!folds || !got.data.lo_code);
    // the button just pressed is now off and would drop the focus: it goes to what the lesson now teaches, which is also what changed
    now.current?.focus();
    onSaved?.();
    router.refresh();
  };
  // what would be sent: the activity only when it differs from what the lesson holds
  const actNow = act === KEEP ? undefined : act === (offers.activity_code ?? "") ? undefined : act;
  const changed = !!sel && (sel !== offers.lo_code || actNow !== undefined);
  const choose = () => go(async () => settle(await pickerChoose(offers.session_id, sel!, actNow, reason), "Chosen."));
  const clear = () => go(async () => settle(await pickerChoose(offers.session_id, "", undefined, reason), "Cleared: the lesson keeps its subject only."));
  const sameAsLastWeek = () => go(async () => {
    const got = await pickerFill(offers.session_id, "same_as_last_week", null, false, reason);
    if (!got.ok) return setSaid({ error: got.why });
    settle(await pickerRead(offers.session_id), got.data.written ? "Copied from last week." : "Already the same as last week.");
  });
  const spread = (dry: boolean) => go(async () => {
    const got = await pickerFill(offers.session_id, "spread", unit, dry, reason);
    if (!got.ok) return setSaid({ error: got.why });
    if (dry) return setPlan({ unit, got: got.data });
    setPlan(null);
    settle(await pickerRead(offers.session_id), `${got.data.written} ${got.data.written === 1 ? "lesson" : "lessons"} planned.`);
  });

  const chosenHere = offers.lo_code && offers.lo_title;
  const rows = (name: string, list: ORow[]) => list.map((o) => <Row key={o.code} name={name} o={o} on={sel === o.code} onPick={pick} />);
  const group = (label: ReactNode, body: ReactNode, key: string) => (
    <div className="lp-group" key={key} data-tier={key}>
      <p className="lp-group-h">{label}</p>
      {body}
    </div>
  );

  return (
    <section className="lp" aria-labelledby={`${id}-h`} data-lesson-picker={offers.session_id} data-ordered={offers.ordered ? "" : undefined}>
      <h3 id={`${id}-h`} className="lp-h">What this lesson teaches</h3>
      {when ? <p className="lp-when" data-picker-when>{when}</p> : null}
      <p className="lp-now" ref={now} tabIndex={-1} data-picker-now={offers.lo_code ?? ""}>
        {chosenHere ? (
          <>
            <strong>{offers.lo_title}</strong>
            {offers.source === "machine" ? <span className="lp-facts"> <MachineMark /> suggested; change it if it is not right</span> : null}
          </>
        ) : (
          "Only its subject so far. Choosing is optional."
        )}
      </p>
      {!open ? (
        <>
          <div className="lp-ends">
            <button type="button" className="btn secondary" onClick={() => { setSaid(null); setOpen(true); }} data-picker-change>
              Change
            </button>
          </div>
          <p role="status" aria-live="polite" className="lp-said" data-picker-said>{said?.done ?? ""}</p>
        </>
      ) : nothing ? (
        <p className="lp-note" data-picker-empty>This subject has no objectives for this grade yet, so there is nothing to choose.</p>
      ) : (
        <>
          {offers.ordered ? null : (
            <p className="lp-note" data-order-unchecked>
              The order of this subject is not checked yet, so the whole subject is shown and nothing is marked as next.{" "}
              {coordinator ? <Link href="/setup/curriculum">Check the order in Curriculum</Link> : "A coordinator checks it in Curriculum."}
            </p>
          )}
          <fieldset className="lp-set" disabled={pending}>
            <legend className="sr-only">Objective</legend>
            {offers.next_up ? group(null, <Row name={`${id}-lo`} o={offers.next_up} on={sel === offers.next_up.code} tag={offers.next_up.new_unit ? "Next up, a new unit" : "Next up"} onPick={pick} />, "next_up") : null}
            {/* what is next is all that is open, so Choose stays in view; the rest is one press away, and opens by itself when it holds the choice */}
            {near.map((t) =>
              t.rows.length ? (
                <details key={t.tier} className="lp-all" data-tier={t.tier} open={t.rows.some((o) => o.code === sel)}>
                  <summary>{V}{t.tier === "rest_of_unit" ? "Rest of the unit" : "Next unit"}: {unitWords(t)}</summary>
                  {rows(`${id}-lo`, t.rows)}
                </details>
              ) : null,
            )}
            <details className="lp-all" open={!offers.next_up} data-tier="all">
              <summary>{V}All of the subject</summary>
              {units.map((u) =>
                u.rows.length ? (
                  <details key={u.unit} className="lp-unit" data-unit={u.unit} open={units.length === 1 || u.rows.some((o) => o.code === sel)}>
                    <summary>{V}{unitWords(u)}</summary>
                    {rows(`${id}-all`, u.rows)}
                  </details>
                ) : null,
              )}
            </details>
          </fieldset>
          {sel ? (
            <fieldset className="lp-set" disabled={pending} aria-busy={reading} data-picker-activities={offers.activities_for ?? ""}>
              <legend className="lp-group-h">Activity</legend>
              {offers.activities.map((a) => (
                <label key={a.code} className="lp-row" data-activity={a.code} data-on={act === a.code ? "" : undefined}>
                  <input type="radio" name={`${id}-act`} value={a.code} checked={act === a.code} onChange={() => setAct(a.code)} />
                  <span className="lp-row-words">
                    <span>{a.name}</span>
                    {a.strand ? <span className="lp-facts">{a.strand}</span> : null}
                  </span>
                </label>
              ))}
              {offers.activity_code && !linkedHas(offers) ? (
                <label className="lp-row" data-activity={KEEP} data-on={act === KEEP ? "" : undefined}>
                  <input type="radio" name={`${id}-act`} value={KEEP} checked={act === KEEP} onChange={() => setAct(KEEP)} />
                  <span className="lp-row-words">Keep the lesson&apos;s activity as it is</span>
                </label>
              ) : null}
              <label className="lp-row" data-activity="" data-on={act === "" ? "" : undefined}>
                <input type="radio" name={`${id}-act`} value="" checked={act === ""} onChange={() => setAct("")} />
                <span className="lp-row-words">
                  <span>No activity</span>
                  {offers.activities.length ? null : <span className="lp-facts">none is linked to this objective yet</span>}
                </span>
              </label>
            </fieldset>
          ) : null}
          {needsReason ? (
            <label className="lp-reason">
              Reason (this fortnight is past planning)
              <input value={reason} onChange={(e) => setReason(e.target.value)} name="reason" data-picker-reason />
            </label>
          ) : null}
          <div className="lp-ends">
            <button type="button" className="btn" disabled={pending || !changed} onClick={choose} data-picker-choose>
              Choose
            </button>
            {skipHref ? (
              <Link href={skipHref} scroll={false} className="btn tertiary" data-picker-skip>Skip for now</Link>
            ) : onSkip ? (
              <button type="button" className="btn tertiary" onClick={onSkip} data-picker-skip>Skip for now</button>
            ) : null}
            {offers.lo_code ? (
              <button type="button" className="btn tertiary" disabled={pending} onClick={clear} data-picker-clear>Clear</button>
            ) : null}
          </div>
          <p role="status" aria-live="polite" className="lp-said" data-picker-said data-error={said?.error ? "" : undefined}>
            {said?.error ?? said?.done ?? ""}
          </p>
          <details className="lp-more" data-picker-more>
            <summary>{V}Plan more of this subject at once</summary>
            <div className="lp-more-b">
              <button type="button" className="btn secondary" disabled={pending} onClick={sameAsLastWeek} data-picker-same>
                Same as last week
              </button>
              <label className="lp-reason">
                Spread a unit over this fortnight&apos;s lessons
                <select value={unit} onChange={(e) => { setUnit(e.target.value); setPlan(null); }} data-picker-unit>
                  <option value="">Choose a unit…</option>
                  {units.filter((u) => !u.other && u.done < u.of).map((u) => (
                    <option key={u.unit} value={u.unit}>{unitWords(u)}</option>
                  ))}
                </select>
              </label>
              {plan && plan.unit === unit ? (
                <div className="lp-plan" data-picker-plan>
                  {plan.got.lessons.length ? (
                    <ol>
                      {plan.got.lessons.map((l) => (
                        <li key={l.id}>
                          <span className="lp-facts">{day(l.on_date)} {l.starts}</span> {l.title}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No lesson of this subject is still to come in this fortnight.</p>
                  )}
                  {plan.got.left_over.length ? <p className="lp-facts">Left over, with no lesson to go in: {plan.got.left_over.map((o) => o.title).join("; ")}.</p> : null}
                  {plan.got.lessons.length ? (
                    <button type="button" className="btn secondary" disabled={pending} onClick={() => spread(false)} data-picker-spread-yes>
                      Use this plan
                    </button>
                  ) : null}
                </div>
              ) : (
                <button type="button" className="btn secondary" disabled={pending || !unit} onClick={() => spread(true)} data-picker-spread>
                  Show the plan
                </button>
              )}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
