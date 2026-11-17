import { sql } from "@/lib/db";
import { headLabels } from "@/lib/subject-looks";
import { dayWords, type Pattern } from "@/lib/timetable-build";
import { day } from "@/lib/timetable-rules";
import Link from "@/components/link";

// The Rules tab: the rules this class's pattern is kept to, one plain sentence each, with Must or Try to (a rule with a weight is a Try to).
// Read here; changing a rule is the Timetable rules page, linked. The two built-in rules have no switch. No subject is named in this file.
type Row = { kind: string; subject_code: string | null; span: string | null; fewest: number | null; most: number | null; weight: number | null; reason: string | null; weekday: number | null; on_date: string | null };

function limitWords(r: Row, label: string): string {
  const span = r.span === "day" ? "a day" : r.span === "week" ? "a week" : "a fortnight";
  if (r.fewest !== null && r.most !== null) return `${label}: ${r.fewest} to ${r.most} ${span}`;
  if (r.most !== null) return `${label}: at most ${r.most} ${span}`;
  if (r.fewest !== null) return `${label}: at least ${r.fewest} ${span}`;
  return `${label}: no limit ${span}`;
}

export async function RulesPanel({ pattern }: { pattern: Pattern }) {
  const labels = await headLabels();
  const rows = await sql<Row[]>`
    select kind, subject_code, span, fewest, most, weight, reason, weekday, on_date::text as on_date from timetable_rule
    where school_class_id = ${pattern.class.id} and kind in ('limit', 'block') order by kind, subject_code, span`;
  const fixed = [...new Set(pattern.cells.filter((c) => c.cell === "fixed").map((c) => c.text))];
  const limits = rows.filter((r) => r.kind === "limit");
  const blocks = rows.filter((r) => r.kind === "block");
  const level = (r: Row) => (r.weight === null ? "Must" : "Try to");
  return (
    <div className="bd-rules">
      <details open>
        <summary>The day</summary>
        <p>{pattern.periods.length} periods, {dayWords(pattern.periods)}.</p>
        {fixed.length ? <p>Fixed every day: {fixed.join(", ")}. <span className="b-muted">Must</span></p> : null}
      </details>
      <details open>
        <summary>How much ({limits.length})</summary>
        {limits.length ? (
          <ul>
            {limits.map((r, i) => (
              <li key={i}>
                {limitWords(r, labels.get(r.subject_code ?? "") ?? r.subject_code ?? "A subject")} <span className="b-muted">{level(r)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">No limits set for this class.</p>
        )}
      </details>
      <details>
        <summary>Days off and events ({blocks.length})</summary>
        {blocks.length ? (
          <ul>
            {blocks.map((r, i) => (
              <li key={i}>{r.reason ?? "Blocked"}: {r.on_date ?? `every ${day(r.weekday ?? 0)}`} <span className="b-muted">Must</span></li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">Nothing blocked.</p>
        )}
      </details>
      <details>
        <summary>Built in</summary>
        <ul>
          <li>An educator teaches one class at a time. <span className="b-muted">Built in; it cannot be switched off.</span></li>
          <li>A class has one lesson at a time. <span className="b-muted">Built in; it cannot be switched off.</span></li>
        </ul>
      </details>
      <Link href={`/timetable/rules?class=${pattern.class.id}`} className="chip">Change the rules</Link>
    </div>
  );
}
