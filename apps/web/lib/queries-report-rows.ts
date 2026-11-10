import { sql } from "./db";
import { inScope, type Scope } from "./scope";
import { reportState, reportWords, type ReportState } from "./queries-reports";

// The Reports screen's rows (UI-8): every active child in the viewer's classes, in class and Sr. No. order, with the state of their
// newest parent report, whether an educator has approved it, and the consent on file. Order is by class and roll only: nothing here
// counts, scores or ranks a person (CP-19's school rule). What waits on CP-19 (report lines, the coordinator's approval, sent) is
// not read here because nothing on main holds it; docs/notes/UI-8.md lists each.
export type Consent = "given" | "withdrawn" | "none";
export type ReportsRow = {
  child_id: string;
  first_name: string;
  band: string;
  section: string;
  roll_no: string;
  report: ReportState;
  consent: Consent;
  /** The report's words as the engine kept them, with [child] not yet filled in; null when none is written. */
  words: { summary: string; can_do: string[]; working_on: string[]; at_home: string[]; next_at_school: string | null } | null;
};

export const STATE_OF = (r: ReportsRow) => reportWords(r.report).short;
export const REPORT_STATES = ["out of date", "to approve", "to write", "approved", "nothing yet"] as const;

export async function reportsRows(actor: string, scope: Scope): Promise<ReportsRow[]> {
  const rows = await sql<(Omit<ReportsRow, "consent" | "words"> & { consent: string | null; draft: string | null })[]>`
    select c.id as child_id, p.first_name, c.band, c.section, c.roll_no, ${reportState(sql`c.id`)} as report,
           (select cn.decision from consent_now cn where cn.child_id = c.id) as consent,
           (select n.body from parent_note n where n.child_id = c.id and n.body like '{"facts"%' order by n.created_at desc limit 1) as draft
    from child_now c, lateral pii.read_child(c.id, ${actor}) p
    where c.active and ${inScope(scope, sql`c.section`)}
    order by grade_ord(c.tenant_id, c.band), c.section, roll_order(c.roll_no), c.roll_no`;
  return rows.map(({ consent, draft, ...r }) => ({
    ...r,
    consent: consent === "given" || consent === "withdrawn" ? consent : "none",
    words: wordsOf(draft, r.first_name),
  }));
}

/** The educator's words out of a kept report's body, the child's name put where the engine left [child] (rule 6: no model saw it). */
function wordsOf(body: string | null, name: string): ReportsRow["words"] {
  if (!body) return null;
  try {
    const d = (JSON.parse(body) as { draft?: Record<string, unknown> }).draft ?? {};
    const put = (s: unknown) => String(s ?? "").replaceAll("[child]", name);
    const list = (v: unknown, key: string) => (Array.isArray(v) ? v.map((x) => put(typeof x === "string" ? x : (x as Record<string, unknown>)[key])) : []);
    return {
      summary: put(d.summary),
      can_do: list(d.can_do, "sentence"),
      working_on: list(d.working_on, "explanation"),
      at_home: list(d.at_home, ""),
      next_at_school: d.next_at_school ? put(d.next_at_school) : null,
    };
  } catch {
    return null;
  }
}
