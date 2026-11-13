import Link from "@/components/link";
import { StatusChip } from "@/components/status-chip";
import type { WaitRow } from "@/lib/today-waiting";

/** "Waiting on you" (page charter B1b): one compact row per kind of work, its state chip and how many, and one action. The row's words
 *  open it in the right panel (`?open=wait:<key>`), without leaving the page; the action opens the work itself. */
export function WaitingList({ rows, open, at = (key) => `/today?open=wait:${key}` }: { rows: readonly WaitRow[]; open?: string; at?: (key: string) => string }) {
  return (
    <ol className="grid gap-[var(--space-2)]" aria-label="Waiting on you" data-waiting>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[var(--space-2)] rounded-[var(--radius-card)] bg-[var(--panel)] p-[var(--space-2)] shadow-[var(--shadow-card)] max-md:grid-cols-[minmax(0,1fr)_auto]" data-row={r.key} data-state={r.state}>
          <Link
            href={at(r.key)}
            scroll={false}
            className={`grid min-h-[44px] content-center rounded-[var(--radius-control)] px-[var(--space-2)] text-[var(--ink)] no-underline${open === r.key ? " outline outline-[3px] outline-[var(--action)]" : ""}`}
            data-wait-open
            data-open-key={`wait:${r.key}`}
            aria-expanded={open === r.key}
            aria-controls={open === r.key ? "detail-panel" : undefined}
          >
            <b>{r.what}</b>
            <span className="b-muted b-label" data-many>{r.many}</span>
          </Link>
          <StatusChip state={r.state} round />
          {r.href ? (
            <Link href={r.href} className="btn secondary whitespace-nowrap" data-wait-action>
              {r.go}
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
