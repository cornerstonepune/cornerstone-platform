"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { Card } from "@/components/cards";
import { StatusChip } from "@/components/status-chip";
import type { Check, Fix, Problem } from "@/lib/timetable-build";

// The builder's right panel (design wireframe 2, E3 and E4): two tabs, Rules and Check. It folds to a strip that still shows the Check count,
// by its button or by `[`, and the choice is remembered in this browser (a convenience only). Problems are sentences with the fixes the
// engine has already proven; a Must problem can be allowed with a reason (the engine says who may). The panel's look is the shared card.
const KEY = "cs.build-panel";
type Tab = "rules" | "check";

export function SidePanel({ check, rules, thisClass, busy, onFix, onAllow }: { check: Check; rules: ReactNode; thisClass: string; busy: boolean; onFix: (f: Fix) => void; onAllow: (p: Problem, reason: string) => Promise<string | null> }) {
  // the panel is only drawn after the builder is (never on the server), so the browser's memory can be read at once
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== "folded";
    } catch {
      return true; // storage refused: the panel simply starts open
    }
  });
  const [tab, setTab] = useState<Tab>(check.problems.length ? "check" : "rules");
  const fold = (to: boolean) => {
    setOpen(to);
    try {
      localStorage.setItem(KEY, to ? "open" : "folded");
    } catch {
      // not remembered, still works
    }
  };
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      const t = e.target;
      if (e.key !== "[" || e.ctrlKey || e.metaKey || (t instanceof HTMLElement && t.closest("input, select, textarea"))) return;
      fold(!open);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const n = check.counts.must + check.counts.try;
  if (!open)
    return (
      <aside className="bd-side" data-folded aria-label="Rules and check">
        <button type="button" className="chip" onClick={() => fold(true)} aria-expanded={false} data-panel-toggle aria-label={`Open the panel: ${n} to check`}>
          {n}
        </button>
      </aside>
    );
  const arrows = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") setTab(tab === "rules" ? "check" : "rules");
  };
  return (
    <aside className="bd-side" aria-label="Rules and check">
      <Card className="bd-panel">
        <div className="bd-panel-head">
          <div role="tablist" aria-label="Panel" onKeyDown={arrows} className="bd-tabs">
            <button type="button" role="tab" id="bd-tab-rules" aria-selected={tab === "rules"} aria-controls="bd-pane" tabIndex={tab === "rules" ? 0 : -1} className={tab === "rules" ? "chip on" : "chip"} onClick={() => setTab("rules")}>Rules</button>
            <button type="button" role="tab" id="bd-tab-check" aria-selected={tab === "check"} aria-controls="bd-pane" tabIndex={tab === "check" ? 0 : -1} className={tab === "check" ? "chip on" : "chip"} onClick={() => setTab("check")} data-check-count={n}>
              Check ({n})
            </button>
          </div>
          <button type="button" className="chip" onClick={() => fold(false)} aria-expanded data-panel-toggle aria-label="Fold the panel (press [)">Fold</button>
        </div>
        <div id="bd-pane" role="tabpanel" aria-labelledby={`bd-tab-${tab}`}>
          {tab === "rules" ? rules : <Problems check={check} thisClass={thisClass} busy={busy} onFix={onFix} onAllow={onAllow} />}
        </div>
      </Card>
    </aside>
  );
}

function Problems({ check, thisClass, busy, onFix, onAllow }: { check: Check; thisClass: string; busy: boolean; onFix: (f: Fix) => void; onAllow: (p: Problem, reason: string) => Promise<string | null> }) {
  const [why, setWhy] = useState<{ key: string; words: string } | null>(null);
  if (!check.problems.length)
    return (
      <div data-all-clear>
        <p>All clear: nothing in this pattern breaks a rule.</p>
        {check.notes.length ? <p className="b-muted">{check.notes.length === 1 ? check.notes[0] : `${check.notes.length} lessons have no named educator, so the educator check skips them.`}</p> : null}
      </div>
    );
  return (
    <ul className="bd-problems" aria-label="Problems">
      {check.problems.map((p) => (
        <li key={p.key} data-problem={p.kind} data-level={p.level}>
          <div className="bd-problem-head">
            {p.allowed ? <StatusChip state="done" words="Allowed" compact round /> : p.level === "must" ? <StatusChip state="clash" words="Must fix" compact round /> : <StatusChip state="waiting" words="Try to" compact round />}
          </div>
          <p>{p.sentence}</p>
          {p.fixes.length ? (
            <div className="bd-fixes" role="group" aria-label="Ways out">
              {p.fixes.map((f, i) => (
                <button key={i} type="button" className="chip" disabled={busy} onClick={() => onFix(f)} data-fix>
                  {f.sentence}{f.class_id !== thisClass ? " (in the other class)" : ""}
                </button>
              ))}
            </div>
          ) : null}
          {p.level === "must" && !p.allowed ? (
            <details className="bd-allow">
              <summary>Allow this once</summary>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
                  const no = await onAllow(p, reason);
                  setWhy(no ? { key: p.key, words: no } : null);
                }}
              >
                <label>
                  Why
                  <input name="reason" required />
                </label>
                <button className="chip" disabled={busy}>Allow</button>
                {why?.key === p.key ? <p role="alert" className="bd-status">{why.words}</p> : null}
              </form>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
