import Link from "@/components/link";
import { Icon } from "@/lib/icons";

// Nothing to show, said once (CP-68): one line and, where there is one, the one useful action, as a quiet button. On a page built on Screen
// the next step is the shell's own; a message standing alone (a panel with no rows) names where to go with `next` (rule 1: no dead ends).
export function EmptyState({ children, next }: { children: React.ReactNode; next?: { href: string; label: string } }) {
  return (
    <div className="b-empty text-label" role="status" data-ux="empty" data-block="EmptyState">
      <Icon name="done" size={20} />
      <p>{children}</p>
      {next ? (
        <Link href={next.href} className="b-btn" data-empty-action>
          {next.label}
        </Link>
      ) : null}
    </div>
  );
}
