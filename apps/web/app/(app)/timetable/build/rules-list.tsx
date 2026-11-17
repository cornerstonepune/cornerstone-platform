"use client";

import { useState, type ReactNode } from "react";
import Link from "@/components/link";
import { SubjectDot } from "@/components/subject-tag";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Look } from "@/lib/subject-looks";
import { awayWords, day, educatorWords, limitSubject, spanWords as span, type Level, type Limit, type Rules } from "@/lib/timetable-rules";
import type { RuleBody } from "./actions";

// The Rules tab of the Build page's panel (CP-71, design E): each rule is one sentence with its numbers as fields. A number saves when the
// field is left; Must or Try to is one choice on the rule's own row; "Add a rule" offers three sentences, never a form of fields. Every
// check and every write is the engine's (the rules door); this draws what it answered and sends what was typed.
export type Placed = Record<string, { A: number; B: number }>;
type Send = (body: RuleBody, words: string) => void;
/** `subjects`: what a rule may name, which is what the class may be painted with (the palette), in the school's order. */
type Shared = { rules: Rules; busy: boolean; send: Send; looks: Record<string, Look>; subjects: { code: string; label: string }[] };

const NONE = "";
const num = (v: string): number | null => (v.trim() === NONE ? null : Math.max(0, Math.round(Number(v))));

function Count({ label, value, onSave, disabled }: { label: string; value: number | null; onSave: (n: number | null) => void; disabled: boolean }) {
  return (
    <input
      key={value ?? NONE}
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      className="bd-n"
      aria-label={label}
      defaultValue={value ?? NONE}
      disabled={disabled}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => {
        const n = num(e.currentTarget.value);
        if (n !== value) onSave(n);
      }}
    />
  );
}

function Strength({ of, level, onSave, disabled }: { of: string; level: Level; onSave: (l: Level) => void; disabled: boolean }) {
  return (
    <select className="bd-level" aria-label={`How firm: ${of}`} value={level} disabled={disabled} onChange={(e) => onSave(e.target.value as Level)} data-level={level}>
      <option value="must">Must</option>
      <option value="try">Try to</option>
    </select>
  );
}

function Remove({ of, onClick, disabled }: { of: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" className="bd-x" aria-label={`Remove: ${of}`} title="Remove" disabled={disabled} onClick={onClick} data-remove>
      <Icon name="close" size={ICON_SIZE.table} />
    </button>
  );
}

function LimitRow({ l, placed, rules, busy, send, looks }: Omit<Shared, "subjects"> & { l: Limit; placed: Placed }) {
  const every = l.subject_code === rules.any_subject;
  const name = limitSubject(rules, l);
  const said = l.span === "day" ? `At most ${l.most ?? ""} of ${name} in a day` : `${name}, ${span(l.span)}`;
  const set = (over: Partial<RuleBody>, words: string) =>
    send({ rule: "limit", action: "set", subject_code: l.subject_code, span: l.span, fewest: l.fewest, most: l.most, level: l.level, ...over }, words);
  const now = placed[l.subject_code];
  return (
    <li className="bd-rule" data-rule="limit" data-span={l.span} data-subject-code={l.subject_code}>
      <span className="bd-rule-s">
        {l.span === "day" ? (
          <>
            At most <Count label={`Most of ${name} in a day`} value={l.most} disabled={busy} onSave={(n) => (n === null ? undefined : set({ most: n }, "Rule changed."))} /> of{" "}
            {every ? name : <SubjectDot look={looks[l.subject_code] ?? "arts"} words={name} />} in a day
          </>
        ) : (
          <>
            <SubjectDot look={looks[l.subject_code] ?? "arts"} words={name} />{" "}
            <Count label={`Fewest ${name} ${span(l.span)}`} value={l.fewest} disabled={busy} onSave={(n) => (n === null && l.most === null ? undefined : set({ fewest: n }, "Rule changed."))} /> to{" "}
            <Count label={`Most ${name} ${span(l.span)}`} value={l.most} disabled={busy} onSave={(n) => (n === null && l.fewest === null ? undefined : set({ most: n }, "Rule changed."))} /> {span(l.span)}
          </>
        )}
      </span>
      <Strength of={said} level={l.level} disabled={busy} onSave={(level) => set({ level }, level === "must" ? "Now a Must." : "Now a Try to.")} />
      <Remove of={said} disabled={busy} onClick={() => send({ rule: "limit", action: "remove", id: l.id }, "Rule removed.")} />
      {l.span !== "day" && now ? (
        <span className="bd-rule-now b-muted">
          Placed now: {now.A} in week A, {now.B} in week B.
        </span>
      ) : null}
    </li>
  );
}

type Adding = "menu" | "count" | "day" | "away" | null;

function Add({ rules, busy, send, subjects: offered }: Pick<Shared, "rules" | "busy" | "send" | "subjects">) {
  const [what, setWhat] = useState<Adding>(null);
  const close = () => setWhat(null);
  const field = (form: FormData, k: string) => String(form.get(k) ?? NONE);
  const submit = (make: (f: FormData) => { body: RuleBody; words: string } | null) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const made = make(new FormData(e.currentTarget));
    if (!made) return;
    send(made.body, made.words);
    close();
  };
  const ends = (
    <span className="bd-add-ends">
      <button className="btn secondary" disabled={busy} data-add-save>
        Add rule
      </button>
      <button type="button" className="btn tertiary" onClick={close}>
        Cancel
      </button>
    </span>
  );
  const subjects = (withEvery: boolean) => (
    <select name="subject_code" aria-label="Subject" required defaultValue={withEvery ? rules.any_subject : NONE}>
      {withEvery ? <option value={rules.any_subject}>any one subject</option> : <option value={NONE} disabled>a subject</option>}
      {offered.map((h) => (
        <option key={h.code} value={h.code}>
          {h.label}
        </option>
      ))}
    </select>
  );
  const strength = (first: Level) => (
    <select name="level" aria-label="How firm" defaultValue={first}>
      <option value="must">Must</option>
      <option value="try">Try to</option>
    </select>
  );
  if (what === "count")
    return (
      <form className="bd-add" data-add="count" onSubmit={submit((f) => {
        const fewest = num(field(f, "fewest"));
        const most = num(field(f, "most"));
        if (fewest === null && most === null) return null;
        return { body: { rule: "limit", action: "set", subject_code: field(f, "subject_code"), span: field(f, "span") as "week", fewest, most, level: field(f, "level") as Level }, words: "Rule added." };
      })}>
        <p className="bd-rule-s">
          {subjects(false)} has <input name="fewest" type="number" min={0} max={99} className="bd-n" aria-label="Fewest" /> to <input name="most" type="number" min={0} max={99} className="bd-n" aria-label="Most" /> lessons{" "}
          <select name="span" aria-label="In">
            <option value="week">a week</option>
            <option value="fortnight">a fortnight</option>
          </select>
          . {strength("must")}
        </p>
        {ends}
      </form>
    );
  if (what === "day")
    return (
      <form className="bd-add" data-add="day" onSubmit={submit((f) => {
        const most = num(field(f, "most"));
        if (most === null) return null;
        return { body: { rule: "limit", action: "set", subject_code: field(f, "subject_code"), span: "day", most, level: field(f, "level") as Level }, words: "Rule added." };
      })}>
        <p className="bd-rule-s">
          At most <input name="most" type="number" min={0} max={20} defaultValue={2} className="bd-n" aria-label="Most in a day" required /> of {subjects(true)} in a day. {strength("try")}
        </p>
        {ends}
      </form>
    );
  if (what === "away")
    return (
      <form className="bd-add" data-add="away" onSubmit={submit((f) => {
        const week = field(f, "week_code");
        const period = field(f, "period_id");
        return {
          body: { rule: "away", action: "set", staff_id: field(f, "staff_id"), weekday: Number(field(f, "weekday")), week_code: week === NONE ? null : (week as "A"), period_id: period === NONE ? null : period, reason: field(f, "reason").trim() },
          words: "Rule added.",
        };
      })}>
        <p className="bd-rule-s">
          <select name="staff_id" aria-label="Educator" required>
            {rules.teaches.map((e) => (
              <option key={e.staff_id} value={e.staff_id}>
                {educatorWords(e).replace(/^t/, "T")}
              </option>
            ))}
          </select>{" "}
          is away on{" "}
          <select name="weekday" aria-label="Weekday">
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {day(d)}
              </option>
            ))}
          </select>
          ,{" "}
          <select name="week_code" aria-label="Which weeks">
            <option value={NONE}>both weeks</option>
            <option value="A">week A</option>
            <option value="B">week B</option>
          </select>
          ,{" "}
          <select name="period_id" aria-label="When in the day">
            <option value={NONE}>all day</option>
            {rules.periods
              .filter((p) => !p.fixed)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.starts_at})
                </option>
              ))}
          </select>
          . Why: <input name="reason" className="bd-why" aria-label="Why" defaultValue="Not in school" maxLength={120} required />
        </p>
        {ends}
      </form>
    );
  if (what === null)
    return (
      <button type="button" className="btn secondary" onClick={() => setWhat("menu")} data-add-rule>
        Add a rule
      </button>
    );
  return (
    <div className="bd-add-menu" role="group" aria-label="Add a rule">
      <button type="button" className="btn secondary" onClick={() => setWhat("count")} data-add-open="count">
        A subject has so many lessons a week
      </button>
      <button type="button" className="btn secondary" onClick={() => setWhat("day")} data-add-open="day">
        At most so many of a subject in a day
      </button>
      {rules.teaches.length ? (
        <button type="button" className="btn secondary" onClick={() => setWhat("away")} data-add-open="away">
          An educator is away on a weekday
        </button>
      ) : null}
      <button type="button" className="btn tertiary" onClick={close}>
        Cancel
      </button>
    </div>
  );
}

function Section({ title, count, children, open = true }: { title: string; count?: number; children: ReactNode; open?: boolean }) {
  return (
    <details className="bd-sec" open={open}>
      <summary>
        <Icon name="chevron-down" size={ICON_SIZE.table} className="bd-sec-v" />
        {title}
        {count ? <span className="bd-sec-n b-num">{count}</span> : null}
      </summary>
      <div className="bd-sec-b">{children}</div>
    </details>
  );
}

export function RulesList({ rules, placed, busy, send, looks, subjects }: Shared & { placed: Placed }) {
  const counts = rules.limits.filter((l) => l.span !== "day");
  const daily = rules.limits.filter((l) => l.span === "day");
  const first = rules.periods[0];
  const last = rules.periods[rules.periods.length - 1];
  const row = { rules, busy, send, looks, placed };
  return (
    <div className="bd-rules" data-rules>
      <Add rules={rules} busy={busy} send={send} subjects={subjects} />
      <Section title="How much" count={counts.length}>
        {counts.length ? <ul className="bd-rule-list">{counts.map((l) => <LimitRow key={l.id} l={l} {...row} />)}</ul> : <p className="b-muted bd-none">No counts yet. Say how many lessons a subject has in a week, and the check holds the pattern to it.</p>}
      </Section>
      <Section title="In a day" count={daily.length}>
        {daily.length ? <ul className="bd-rule-list">{daily.map((l) => <LimitRow key={l.id} l={l} {...row} />)}</ul> : <p className="b-muted bd-none">No rule for a day yet.</p>}
      </Section>
      <Section title="Who teaches" count={rules.away.length}>
        <ul className="bd-rule-list">
          {rules.teaches.map((e) => {
            const who = educatorWords(e).replace(/^t/, "T");
            const days = rules.away.filter((a) => a.staff_id === e.staff_id);
            return (
              <li key={e.staff_id} className="bd-who" data-educator>
                <span className="bd-rule-s">{who}</span>
                {days.length ? (
                  <ul className="bd-rule-list">
                    {days.map((a) => (
                      <li key={a.id} className="bd-rule" data-rule="away">
                        <span className="bd-rule-s">
                          {awayWords(a)}. <span className="b-muted">{a.reason}</span>
                        </span>
                        <Remove of={`${who}: ${awayWords(a)}`} disabled={busy} onClick={() => send({ rule: "away", action: "remove", id: a.id }, "Rule removed.")} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="b-muted bd-rule-now">In school every day.</span>
                )}
              </li>
            );
          })}
          {rules.teaches.length ? null : <li className="b-muted bd-none">No educator is named for this class yet, so nobody&apos;s days can be checked.</li>}
          <li className="bd-builtin b-muted">An educator teaches one class at a time. Always on.</li>
          <li className="bd-builtin b-muted">A class has one lesson at a time. Always on.</li>
        </ul>
      </Section>
      <Section title="The day" open={false}>
        <p className="bd-rule-s">
          {rules.periods.length} periods{first && last ? `, ${first.starts_at} to ${last.ends_at ?? last.starts_at}` : NONE}.
        </p>
        <Link href={`/timetable/rules?class=${rules.class.id}`}>Change the day&apos;s times and fixed rows</Link>
      </Section>
    </div>
  );
}
