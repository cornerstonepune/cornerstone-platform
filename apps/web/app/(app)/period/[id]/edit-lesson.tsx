"use client";

import { useState, useTransition } from "react";
import { editLesson } from "./actions";

// The coordinator's Edit on a lesson (CP-35's edit): the lesson's words, and a reason once the fortnight is past planning (the engine asks
// for it in its own words). Nothing is decided here; the engine's answer comes back as it is.
export function EditLesson({ sessionId, text }: { sessionId: string; text: string }) {
  const [words, setWords] = useState(text);
  const [reason, setReason] = useState("");
  const [said, setSaid] = useState<{ error?: string; done?: string } | null>(null);
  const [pending, go] = useTransition();
  return (
    <form
      className="grid gap-3"
      aria-label="Edit the lesson"
      onSubmit={(e) => {
        e.preventDefault();
        go(async () => setSaid(await editLesson(sessionId, words, reason)));
      }}
    >
      <label className="grid gap-1 text-[length:var(--text-label)] text-[var(--ink-muted)]">
        What the lesson is
        <input className="input" value={words} onChange={(e) => setWords(e.target.value)} name="text" />
      </label>
      <label className="grid gap-1 text-[length:var(--text-label)] text-[var(--ink-muted)]">
        Reason (asked once the fortnight is past planning)
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} name="reason" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || !words.trim()} data-edit-lesson>
          Save the lesson
        </button>
        {said?.error ? <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--state-late)] bg-[var(--state-late-bg)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--state-late)]">{said.error}</p> : null}
        {said?.done ? <p role="status" className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{said.done}</p> : null}
      </div>
    </form>
  );
}
