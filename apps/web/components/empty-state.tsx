import Link from "@/components/link";
import { Icon } from "@/lib/icons";

// Nothing to show, said once. On a page built on Screen the next step is the shell's own; a message standing alone
// (a panel with no rows) names where to go with `next` (rule 1: no dead ends).
export function EmptyState({ children, next }: { children: React.ReactNode; next?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-center gap-[var(--space-2)] rounded-[var(--radius-card)] bg-[var(--state-ok-bg)] p-[var(--space-2)] text-label text-[var(--state-ok)]" role="status" data-ux="empty" data-block="EmptyState">
      <Icon name="done" size={20} />
      <p className="text-[var(--ink)]">{children}</p>
      {next ? (
        <p className="mt-2">
          <Link href={next.href} className="chip">
            {next.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
