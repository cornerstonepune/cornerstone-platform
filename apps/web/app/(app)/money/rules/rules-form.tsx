"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/cards";
import { Icon } from "@/lib/icons";
import { rupees } from "@/lib/money-format";
import { type Draft, KIND, LIMIT_GROUPS, draftKinds, kind, ladderWith, opsAboveOf, role, roleName, type RulesView } from "@/lib/money-rules";
import { saveRules } from "./actions";
import { Categories } from "./categories";
import "./rules.css";

const known = Object.keys(KIND);
/** The kinds of claim in the school's order (expense first), any the screen does not know after them. */
const byKind = (a: string, b: string) => (known.indexOf(a) + 1 || known.length + 1) - (known.indexOf(b) + 1 || known.length + 1);
const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** A role chosen from the ladder, in the sentence it belongs to; read, it is the role in words. */
function Pick({ value, ladder, label, editable, onChange }: { value: string; ladder: string[]; label: string; editable: boolean; onChange: (role: string) => void }) {
  const above = ladder.indexOf(value) < ladder.length - 1 ? " or above" : "";
  if (!editable)
    return (
      <span>
        <strong>{role(value)}</strong>
        {above}
      </span>
    );
  return (
    <span className="mr-pick">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {ladder.map((r) => (
          <option key={r} value={r}>
            {role(r)}
          </option>
        ))}
      </select>
      {above}
    </span>
  );
}

/** The money rules, as sentences with their fields in them. `editable`: a person who may change them; otherwise the same sentences, read. */
export function RulesForm({ view, editable }: { view: RulesView; editable: boolean }) {
  const { rules } = view;
  const [limits, setLimits] = useState(() => Object.fromEntries(Object.entries(rules.limits).map(([k, v]) => [k, String(v)])));
  const [kinds, setKinds] = useState(() => draftKinds(rules.kinds));
  const [opsAbove, setOpsAbove] = useState(() => opsAboveOf(rules.ladder));
  const [categories, setCategories] = useState(view.categories);
  const [reason, setReason] = useState("");
  const [refused, setRefused] = useState<{ words: string } | null>(null);
  const [busy, start] = useTransition();
  const alert = useRef<HTMLDivElement>(null);
  const ladder = opsAbove ? ladderWith(rules.ladder, opsAbove) : rules.ladder;

  // the engine's words are at the top and the Save is at the foot: bring them into view
  useEffect(() => {
    alert.current?.focus();
  }, [refused]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setRefused(null);
    start(async () => {
      const said = await saveRules({ version: view.version, limits, kinds, opsAbove, categories, reason });
      if (said) setRefused({ words: said.error });
    });
  };
  const route = (code: string, edit: (r: Draft["kinds"][string]) => Draft["kinds"][string]) => setKinds((k) => ({ ...k, [code]: edit(k[code]) }));

  return (
    <form id="money-rules" className="mr" onSubmit={save} data-rules-form={editable ? "edit" : "read"} aria-label="Money rules">
      {refused ? (
        <div ref={alert} className="mr-alert" role="alert" tabIndex={-1}>
          <strong>
            <Icon name="fix-this" size={20} />
            The rules were not saved.
          </strong>
          <ul>
            {refused.words.split("; ").map((w) => (
              <li key={w}>{capital(w).replace(/\.?$/, ".")}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card as="section" aria-labelledby="mr-limits" data-section="limits">
        <h2 id="mr-limits">Limits and deadlines</h2>
        <div className="mr-groups">
          {LIMIT_GROUPS.map((g) => (
            <div key={g.title} className="mr-group">
              <h3>{g.title}</h3>
              {g.lines
                .filter((l) => l.key in limits)
                .map((l) => {
                  const say = (
                    <>
                      <span>{l.before}</span>
                      <span className="mr-tail">
                        {editable ? (
                          <span className="mr-num">
                            {l.money ? <span>₹</span> : null}
                            <input type="number" inputMode="numeric" min={0} step={1} required value={limits[l.key]} onChange={(e) => setLimits({ ...limits, [l.key]: e.target.value })} />
                          </span>
                        ) : (
                          <strong>{l.money ? rupees(limits[l.key]) : limits[l.key]}</strong>
                        )}
                        {l.after ? <span>{l.after}</span> : null}
                      </span>
                    </>
                  );
                  return editable ? (
                    <label key={l.key} className="mr-line">
                      {say}
                    </label>
                  ) : (
                    <p key={l.key} className="mr-line">
                      {say}
                    </p>
                  );
                })}
            </div>
          ))}
        </div>
      </Card>

      <Card as="section" aria-labelledby="mr-who" data-section="who">
        <h2 id="mr-who">Who approves and who pays</h2>
        <ul className="mr-kinds">
          {Object.keys(rules.kinds).sort(byKind).map((code) => {
            const r = kinds[code];
            const said = kind(code);
            return (
              <li key={code} className="mr-kind" data-kind-of-claim={said}>
                <p className="mr-line">
                  <span>{said} is approved by</span>
                  <Pick value={r.approve} ladder={ladder} label={`Who approves: ${said.toLowerCase()}`} editable={editable} onChange={(by) => route(code, (x) => ({ ...x, approve: by }))} />
                </p>
                {r.pay.map((t, i) => {
                  const last = i === r.pay.length - 1;
                  const start = r.pay.length === 1 ? "It is paid by" : i === 0 ? "Up to" : last ? "Above that it is paid by" : "Then up to";
                  const pays = (
                    <Pick
                      value={t.by}
                      ladder={ladder}
                      label={`Who pays: ${said.toLowerCase()}${r.pay.length > 1 ? (last ? ", above the last limit" : `, up to limit ${i + 1}`) : ""}`}
                      editable={editable}
                      onChange={(by) => route(code, (x) => ({ ...x, pay: x.pay.map((p, j) => (j === i ? { ...p, by } : p)) }))}
                    />
                  );
                  return (
                    <p key={i} className="mr-line">
                      <span>{start}</span>
                      {t.up_to === null ? (
                        pays
                      ) : (
                        <>
                          {editable ? (
                            <span className="mr-num">
                              <span>₹</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                required
                                aria-label={`${said}: pay limit ${i + 1}, in rupees`}
                                value={t.up_to}
                                onChange={(e) => route(code, (x) => ({ ...x, pay: x.pay.map((p, j) => (j === i ? { ...p, up_to: e.target.value } : p)) }))}
                              />
                            </span>
                          ) : (
                            <strong>{rupees(t.up_to)}</strong>
                          )}
                          <span>it is paid by</span>
                          {pays}
                        </>
                      )}
                    </p>
                  );
                })}
              </li>
            );
          })}
        </ul>
      </Card>

      {opsAbove ? (
        <Card as="section" aria-labelledby="mr-ladder" data-section="ladder">
          <h2 id="mr-ladder">Where the operations lead sits</h2>
          <ol className="mr-ladder" aria-label="Roles, lowest first">
            {ladder.map((r) => (
              <li key={r} data-ops={r === "ops" ? "" : undefined}>
                {roleName(r)}
              </li>
            ))}
          </ol>
          <p className="mr-note">Each role may do whatever the roles below it may.</p>
          {editable ? (
            <label className="mr-line">
              <span>The operations lead ranks just above</span>
              <select value={opsAbove} onChange={(e) => setOpsAbove(e.target.value)}>
                {rules.ladder
                  .filter((r) => r !== "ops")
                  .map((r) => (
                    <option key={r} value={r}>
                      {role(r)}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </Card>
      ) : null}

      <Card as="section" aria-labelledby="mr-categories" data-section="categories">
        <h2 id="mr-categories">
          What a claim is for <span className="mr-count">{categories.length}</span>
        </h2>
        <p className="mr-note">The order here is the order of the list on the claim form. Claims already filed keep the category they were filed under.</p>
        <Categories names={categories} onChange={setCategories} editable={editable} />
      </Card>

      {editable ? (
        <div className="mr-save">
          <label className="mr-reason">
            <span>Why are you changing them? (optional)</span>
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="btn" data-ux="action" disabled={busy}>
            {busy ? "Saving…" : "Save the rules"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
