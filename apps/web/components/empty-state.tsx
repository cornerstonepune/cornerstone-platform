import Link from "@/components/link";

// Nothing to show, said once. On a page built on Screen the next step is the shell's own; a message standing alone
// (a panel with no rows) names where to go with `next` (rule 1: no dead ends).
export function EmptyState({ children, next }: { children: React.ReactNode; next?: { href: string; label: string } }) {
  return (
    <div className="mb-4 border border-[var(--state-ok)] bg-[var(--state-ok-bg)] p-3 text-[13.5px]" role="status" data-ux="empty">
      <p>{children}</p>
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
