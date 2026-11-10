import { StatusChip, type State } from "@/components/status-chip";
import { approveLine, saveLine, sendReport } from "./actions";
import type { ReportsRow } from "@/lib/queries-report-rows";

export type StagedLine = { id: string; words: string; evidence: string[]; stage: "drafted" | "educator_approved" | "coordinator_approved"; thin: boolean; educator_approved_by: string | null; coordinator_approved_by: string | null };
const CHIP: Record<StagedLine["stage"], { state: State; words: string }> = {
  drafted: { state: "toDo", words: "to approve (educator)" },
  educator_approved: { state: "toApprove", words: "to approve (coordinator)" },
  coordinator_approved: { state: "approved", words: "approved twice" },
};

/** One child's report lines: the educator's words (a field), the system's state beside it (read-only), Approve for the stage the line is at,
 *  and Send for a coordinator once every line holds both approvals and consent is on file. Nothing is delivered. */
export function Lines({ r, lines, sent, me, coordinator }: { r: ReportsRow; lines: StagedLine[]; sent: string | null; me: string | undefined; coordinator: boolean }) {
  const approved = !sent && lines.length > 0 && lines.every((l) => l.stage === "coordinator_approved");
  const ready = approved && r.consent === "given";
  // the database refuses a send without consent on record, so the page says what is missing and offers no Send that cannot work
  const missing = r.consent === "withdrawn" ? "Consent was withdrawn for this child" : "No consent is on record for this child";
  return (
    <div className="grid gap-3" data-lines={r.child_id}>
      {lines.length === 0 ? <p>No report lines drafted yet</p> : null}
      {lines.map((l) => (
        <form key={l.id} action={saveLine} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="child_id" value={r.child_id} />
          <input type="hidden" name="note_id" value={r.note_id ?? ""} />
          <input type="hidden" name="line_id" value={l.id} />
          <label className="grid gap-1">
            <span className="note">{l.thin ? "Rests on few pieces of evidence" : "Rests on the child's own dated evidence"}</span>
            <textarea name="words" defaultValue={l.words} rows={2} disabled={!!sent} aria-label="The line's words" />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <StatusChip state={CHIP[l.stage].state} words={CHIP[l.stage].words} />
            {!sent ? <button type="submit" className="btn secondary">Save words</button> : null}
            {!sent && (l.stage === "drafted" || (l.stage === "educator_approved" && coordinator && l.educator_approved_by !== me)) ? (
              <button type="submit" formAction={approveLine} className="btn">{l.stage === "drafted" ? "Approve" : "Approve (coordinator)"}</button>
            ) : null}
          </div>
        </form>
      ))}
      {sent ? <p>Marked sent {sent.slice(0, 10)}. Nothing was delivered to a parent.</p> : null}
      {coordinator && approved && !ready ? (
        <p role="status" data-ux="consent-needed">Every line is approved twice. {missing}, so this report cannot be sent. Record consent under Setup, Classes and children, then Send appears here.</p>
      ) : null}
      {coordinator && ready ? (
        <form action={sendReport}>
          <input type="hidden" name="child_id" value={r.child_id} />
          <input type="hidden" name="note_id" value={r.note_id ?? ""} />
          <button type="submit" className="btn">Send</button>
        </form>
      ) : null}
    </div>
  );
}
