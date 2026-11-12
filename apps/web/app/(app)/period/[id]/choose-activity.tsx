"use client";

import { useState, useTransition } from "react";
import { chooseActivity } from "./actions";

// The coordinator's "Choose an activity" (CP-39's offers, CP-35's edit): the activities of this lesson's kind, one chosen, a reason past
// planning (the engine asks for it in its own words). The list is the engine's; none is made up.
export function ChooseActivity({ sessionId, offers, current, kind }: { sessionId: string; offers: { code: string; name: string; strand: string; objectives: number; skills: number }[]; current: string | null; kind: string }) {
  const [code, setCode] = useState(current ?? "");
  const [reason, setReason] = useState("");
  const [said, setSaid] = useState<{ error?: string; done?: string } | null>(null);
  const [pending, go] = useTransition();
  if (!offers.length) return <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-no-offers>No activity is offered for a {kind || "lesson of this kind"}.</p>;
  return (
    <form
      className="grid max-w-xl gap-3"
      aria-label="Choose an activity"
      onSubmit={(e) => {
        e.preventDefault();
        go(async () => setSaid(await chooseActivity(sessionId, code, reason)));
      }}
    >
      <label className="grid gap-1 text-[13px] text-[var(--ink-muted)]">
        Activity
        <select className="select" value={code} onChange={(e) => setCode(e.target.value)} name="activity">
          <option value="">Choose one…</option>
          {offers.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name} · {o.strand} · {o.objectives} objective{o.objectives === 1 ? "" : "s"}, {o.skills} skill{o.skills === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[13px] text-[var(--ink-muted)]">
        Reason (asked once the fortnight is past planning)
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} name="reason" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || !code} data-choose>
          Choose an activity
        </button>
        {said?.error ? <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--state-late)] bg-[var(--state-late-bg)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--state-late)]">{said.error}</p> : null}
        {said?.done ? <p role="status" className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{said.done}</p> : null}
      </div>
    </form>
  );
}
