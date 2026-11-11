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
  /** CP-19: the newest report's id, its lines by how many approvals each holds now, and when it was sent. */
  note_id: string | null;
  lines: { drafted: number; educator: number; coordinator: number };
  sent_at: string | null;
  /** null when the viewer may not read consent (the school's access rule: the coordinator alone sees it), so no word is guessed. */
  consent: Consent | null;
  /** The report's words as the engine kept them, with [child] not yet filled in; null when none is written. */
  words: { summary: string; can_do: string[]; working_on: string[]; at_home: string[]; next_at_school: string | null } | null;
};

export const STATE_OF = (r: ReportsRow) => reportWords(r.report).short;
export const REPORT_STATES = ["out of date", "to approve", "to write", "approved", "nothing yet"] as const;

export async function reportsRows(actor: string, scope: Scope): Promise<ReportsRow[]> {
  const rows = await sql<(Omit<ReportsRow, "consent" | "words" | "lines"> & { consent: string | null; draft: string | null; drafted: number; educator: number; coordinator: number })[]>`
    select c.id as child_id, p.first_name, c.band, c.section, c.roll_no, ${reportState(sql`c.id`)} as report,
           (select case when (select public.my_reach('consent')) = 'none' then null else coalesce((select cn.decision from consent_now cn where cn.child_id = c.id), 'none') end) as consent,
           (select n.body from parent_note n where n.child_id = c.id and n.body like '{"facts"%' order by n.created_at desc limit 1) as draft,
           nn.id::text as note_id, nn.sent_at::text as sent_at,
           coalesce(ln.drafted, 0)::int as drafted, coalesce(ln.educator, 0)::int as educator, coalesce(ln.coordinator, 0)::int as coordinator
    from child_now c, lateral pii.read_child(c.id, ${actor}) p
    left join lateral (select n.id, n.sent_at, n.lines from parent_note n where n.child_id = c.id and n.body like '{"facts"%' order by n.created_at desc limit 1) nn on true
    left join lateral (
      -- a line's approvals now: the approved rows after its last withdrawal (the engine's own reading, report_lines._approvals)
      select count(*) filter (where k = 0) as drafted, count(*) filter (where k = 1) as educator, count(*) filter (where k >= 2) as coordinator
      from (select (select count(*) from approval a where a.kind = 'report_line' and a.decision = 'approved' and a.target = nn.id::text || ':' || (l ->> 'id')
                      and a.seq > coalesce((select max(w.seq) from approval w where w.kind = 'report_line' and w.target = a.target and w.decision = 'withdrawn'), 0)) as k
            from jsonb_array_elements(coalesce(nn.lines, '[]'::jsonb)) l) per
    ) ln on true
    where c.active and ${inScope(scope, sql`c.section`)}
    order by grade_ord(c.tenant_id, c.band), c.section, roll_order(c.roll_no), c.roll_no`;
  return rows.map(({ consent, draft, drafted, educator, coordinator, ...r }) => ({
    ...r,
    lines: { drafted, educator, coordinator },
    consent: consent === "given" || consent === "withdrawn" || consent === "none" ? consent : null,
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

/** Whether the viewer is of the group the school lets read consent: the coordinator's (an access row, so moving a role is an update there). */
export async function seesConsent(): Promise<boolean> {
  const [r] = await sql<{ all: boolean }[]>`select public.my_reach('consent') = 'all' as all`;
  return !!r?.all;
}
