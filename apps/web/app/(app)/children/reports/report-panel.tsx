import { StatusChip, type State } from "@/components/status-chip";
import type { Opened } from "@/components/detail-panel";
import type { LineFact, ReportsRow } from "@/lib/queries-report-rows";
import { STAGE_WORDS, stageOf, totalLines, type Consent } from "@/lib/queries-report-rows";
import { Lines, type StagedLine } from "./lines";

// A child's report opened on the right of Reports (page charter Part C, "Parent reports: keep, last", on the frame's Workspace): its lines
// with their actions (Save words, Approve, Send: ./actions.ts, the engine's rules), the whole report's words, and where its approvals and
// consent stand. "Open full page" is the child's parent page.
export const CONSENT_WORDS: Record<Consent, string> = { given: "on file", withdrawn: "withdrawn: needed", none: "none on record: needed" };

/** How far a stage's approvals have come, as "3 of 6": a chip toned by whether all, some or none of the lines have it. */
export const ofTotal = (n: number, total: number): { state: State; words: string } => ({ state: n === total ? "done" : n > 0 ? "toApprove" : "toDo", words: `${n} of ${total}` });

export function reportPanel(
  r: ReportsRow,
  o: { className: string; staged: { lines: StagedLine[]; sent_at: string | null } | null; facts: ReadonlyMap<string, LineFact>; me: string | undefined; coordinator: boolean; closeHref: string; tab?: string },
): Opened {
  const total = totalLines(r);
  const lines = o.staged ? (
    <Lines r={r} lines={o.staged.lines} facts={o.facts} sent={o.staged.sent_at} me={o.me} coordinator={o.coordinator} />
  ) : (
    <p>{r.note_id ? "The lines could not be read just now." : "No report lines drafted yet"}</p>
  );
  const w = r.words;
  const report = w ? (
    <div className="grid gap-2" data-part="report-words">
      <p>{w.summary}</p>
      {[...w.can_do, ...w.working_on, ...w.at_home].length ? (
        <ul className="list-disc pl-5">
          {[...w.can_do, ...w.working_on, ...w.at_home].map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : null}
      {w.next_at_school ? <p>{w.next_at_school}</p> : null}
    </div>
  ) : (
    <p>Not written yet</p>
  );
  const approvals = (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-[var(--space-3)] gap-y-[var(--space-2)]" data-part="approvals">
      <dt className="b-muted">Educator approved</dt>
      <dd>{total ? <StatusChip {...ofTotal(r.lines.educator + r.lines.coordinator, total)} /> : "no lines yet"}</dd>
      <dt className="b-muted">Coordinator approved</dt>
      <dd>{total ? <StatusChip {...ofTotal(r.lines.coordinator, total)} /> : "no lines yet"}</dd>
      {/* consent is the coordinator's alone to see (the school's access rule) */}
      {o.coordinator && r.consent ? (
        <>
          <dt className="b-muted">Consent</dt>
          <dd><StatusChip state={r.consent === "given" ? "done" : "notYet"} words={CONSENT_WORDS[r.consent]} /></dd>
        </>
      ) : null}
      <dt className="b-muted">Sent</dt>
      <dd>{r.sent_at ? r.sent_at.slice(0, 10) : "not sent"}</dd>
    </dl>
  );
  return {
    key: `report:${r.child_id}`,
    kind: "child",
    title: `${r.roll_no} ${r.first_name}`,
    line: `${o.className} · ${STAGE_WORDS[stageOf(r)]}`,
    full: `/growth/${r.child_id}/parent`,
    closeHref: o.closeHref,
    tab: o.tab,
    tabs: [
      { key: "lines", label: "Lines", body: lines },
      { key: "report", label: "Report", body: report },
      { key: "approvals", label: "Approvals", body: approvals },
    ],
  };
}
