"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import { RULE, type Fix, type Problem } from "@/lib/timetable-check";

// The Check tab of the Build page's panel (CP-71, wireframe 4): each problem is the engine's sentence, the rule behind it, and up to three
// ways out the engine has already proven (it ran the checker on the pattern as it would be). A Must stops publishing until it is fixed or
// allowed once with a reason; a Try to never does. Pointing at a problem lights its lessons in the grid.
const CHIP = {
  must: { state: "toCheck", words: "must fix" },
  try: { state: "waiting", words: "try to" },
  allowed: { state: "done", words: "allowed" },
} as const;

function Allow({ problem, busy, onAllow }: { problem: Problem; busy: boolean; onAllow: (p: Problem, reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <details className="bd-allow">
      <summary>Allow this once</summary>
      <form
        className="b-field"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onAllow(problem, reason.trim());
        }}
      >
        <label htmlFor={`why-${problem.key}`}>Why it can stand</label>
        <input id={`why-${problem.key}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoComplete="off" required />
        <button className="btn secondary" disabled={busy || !reason.trim()} data-allow={problem.key}>
          Allow
        </button>
      </form>
    </details>
  );
}

export function CheckList({
  problems,
  notes,
  why,
  checking,
  busy,
  classId,
  onFix,
  onAllow,
  onFlag,
  onShow,
}: {
  problems: Problem[];
  notes: string[];
  /** Why the check could not be read, in the engine's words. */
  why: string | null;
  checking: boolean;
  busy: boolean;
  classId: string;
  onFix: (p: Problem, f: Fix) => void;
  onAllow: (p: Problem, reason: string) => void;
  onFlag: (p: Problem | null) => void;
  /** Take the person to the problem's lesson in the grid. */
  onShow: (p: Problem) => void;
}) {
  if (why)
    return (
      <p className="bd-check-why" role="alert">
        {why}
      </p>
    );
  return (
    <div className="bd-check" data-check aria-busy={checking}>
      {problems.length === 0 ? (
        <EmptyState>All clear. Nothing here stops publishing.</EmptyState>
      ) : (
        <ul className="bd-probs" aria-label="Problems">
          {problems.map((p) => {
            const chip = p.allowed ? CHIP.allowed : CHIP[p.level];
            // a fix may move another class's lesson: it says whose
            const whose = (f: Fix) => (f.class_id === classId ? "" : `${p.places.find((x) => x.class_id === f.class_id)?.class ?? "The other class"}: `);
            return (
              <li key={p.key} className="bd-prob" data-problem={p.kind} data-level={p.level} data-allowed={p.allowed ? "" : undefined} onMouseEnter={() => onFlag(p)} onMouseLeave={() => onFlag(null)} onFocus={() => onFlag(p)} onBlur={() => onFlag(null)}>
                <StatusChip state={chip.state} words={chip.words} compact round />
                <button type="button" className="bd-prob-s" onClick={() => onShow(p)} title="Show it in the grid" data-show>
                  {p.sentence}
                </button>
                <p className="b-muted bd-prob-rule">{RULE[p.kind]}</p>
                {p.allowed ? null : p.fixes.length ? (
                  <div className="bd-fixes" role="group" aria-label="Ways out">
                    {[...p.fixes.filter((f) => f.class_id === classId), ...p.fixes.filter((f) => f.class_id !== classId)].map((f) => (
                      <button key={f.sentence} type="button" className="btn secondary" disabled={busy} onClick={() => onFix(p, f)} data-fix>
                        {whose(f)}
                        {f.sentence.replace(/\.$/, "")}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="b-muted bd-prob-rule">No single move fixes this. Move a lesson by hand{p.level === "must" ? ", or allow it once" : ""}.</p>
                )}
                {p.level === "must" && !p.allowed ? <Allow problem={p} busy={busy} onAllow={onAllow} /> : null}
              </li>
            );
          })}
        </ul>
      )}
      {notes.length ? (
        <ul className="bd-notes b-muted" aria-label="Not checked">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
