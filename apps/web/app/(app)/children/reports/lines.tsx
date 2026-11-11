import { Cards, type Card } from "@/components/cards";
import { StatusChip, type State } from "@/components/status-chip";
import type { LineFact, ReportsRow } from "@/lib/queries-report-rows";
import { approveLine, saveLine, sendReport } from "./actions";

export type StagedLine = { id: string; words: string; evidence: string[]; stage: "drafted" | "educator_approved" | "coordinator_approved"; thin: boolean; educator_approved_by: string | null; coordinator_approved_by: string | null };
const CHIP: Record<StagedLine["stage"], { state: State; words: string }> = {
  drafted: { state: "toDo", words: "to approve (educator)" },
  educator_approved: { state: "toApprove", words: "to approve (coordinator)" },
  coordinator_approved: { state: "approved", words: "approved twice" },
};

/** One child's report lines as cards, three to a row (the wireframe's three line cards): the skill the line is about, the system's state of
 *  that skill beside the educator's words (read only), the words as a field, and Approve for the stage the line is at. Below them, Send for a
 *  coordinator once every line holds both approvals and consent is on file. Nothing is delivered. */
export function Lines({ r, lines, facts, sent, me, coordinator }: { r: ReportsRow; lines: StagedLine[]; facts: ReadonlyMap<string, LineFact>; sent: string | null; me: string | undefined; coordinator: boolean }) {
  const approved = !sent && lines.length > 0 && lines.every((l) => l.stage === "coordinator_approved");
  const ready = approved && r.consent === "given";
  // the database refuses a send without consent on record, so the page says what is missing and offers no Send that cannot work
  const missing = r.consent === "withdrawn" ? "Consent was withdrawn for this child" : "No consent is on record for this child";

  const titles = lines.map((l, i) => facts.get(l.evidence[0] ?? "")?.name ?? `Line ${i + 1}`);
  const cards: Card[] = lines.map((l, i) => {
    const fact = facts.get(l.evidence[0] ?? "");
    // two lines about one skill still need their own titles
    const title = titles.filter((t) => t === titles[i]).length > 1 ? `${titles[i]} (${i + 1})` : titles[i];
    return {
      kind: "skill",
      title,
      body: (
        <form action={saveLine} className="grid gap-2">
          <input type="hidden" name="child_id" value={r.child_id} />
          <input type="hidden" name="note_id" value={r.note_id ?? ""} />
          <input type="hidden" name="line_id" value={l.id} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="b-muted">The system&rsquo;s state, read only</span>
            <StatusChip state={fact?.look ?? "notSeenYet"} words={fact?.look ? (fact.words ?? undefined) : undefined} />
          </div>
          <label className="grid gap-1">
            <span className="b-muted">{l.thin ? "Rests on few pieces of evidence" : "Rests on the child's own dated evidence"}</span>
            <textarea name="words" defaultValue={l.words} rows={3} disabled={!!sent} aria-label="The line's words" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip state={CHIP[l.stage].state} words={CHIP[l.stage].words} />
            {!sent ? <button type="submit" className="btn secondary">Save words</button> : null}
            {!sent && (l.stage === "drafted" || (l.stage === "educator_approved" && coordinator && l.educator_approved_by !== me)) ? (
              <button type="submit" formAction={approveLine} className="btn">{l.stage === "drafted" ? "Approve" : "Approve (coordinator)"}</button>
            ) : null}
          </div>
        </form>
      ),
    };
  });
  const rows: Card[][] = [];
  for (let i = 0; i < cards.length; i += 3) rows.push(cards.slice(i, i + 3));

  return (
    <div className="grid gap-3" data-lines={r.child_id}>
      {lines.length === 0 ? <p>No report lines drafted yet</p> : null}
      {rows.map((row, i) => (
        <Cards key={i} cards={row} />
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
