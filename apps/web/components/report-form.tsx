"use client";

import { useActionState } from "react";
import { submitNote, type Said } from "@/lib/feedback-actions";
import { WARNING } from "@/lib/feedback-words";

// The form of "Report a problem or suggest something": what happened, where (the page the person came from, editable) and Send. A client
// component only so the words stay in the boxes when a note is refused; React empties a form once its action has run, so each answer
// opens the form afresh (`key`) holding what came back. The note's words are never kept with a child's name: the warning says so.
export function ReportForm({ from, maxChars }: { from: string; maxChars: number }) {
  const [said, action, pending] = useActionState<Said, FormData>(submitNote, null);
  const kept = said?.kept ?? {};
  return (
    <form action={action} key={JSON.stringify(said)} data-block="Form" className="b-form">
      {said ? (
        <p role="status" className={`border p-3 text-[length:var(--text-label)] ${said.ok ? "border-neem/30 bg-neem/10" : "border-terracotta/30 bg-terracotta/10"}`}>
          {said.words}
        </p>
      ) : null}
      <div className="b-field">
        <label htmlFor="f-what">What happened, or what you would like</label>
        <textarea id="f-what" name="what" maxLength={maxChars} required defaultValue={kept.what} aria-describedby="report-warning" className="min-h-28 py-2" />
      </div>
      <p id="report-warning" className="b-muted">
        {WARNING}
      </p>
      <div className="b-field">
        <label htmlFor="f-where">Where (the page you came from)</label>
        <input id="f-where" name="where" defaultValue={kept.where ?? from} />
      </div>
      <div>
        <button className="b-btn b-btn-main" type="submit" disabled={pending} data-press data-main>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
