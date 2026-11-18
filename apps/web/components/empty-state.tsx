import Link from "@/components/link";
import { Icon } from "@/lib/icons";

// Nothing to show, said once (CP-68): one line and, where there is one, the one useful action, as a quiet button. On a page built on Screen
// the next step is the shell's own; a message standing alone (a panel with no rows) names where to go with `next` (rule 1: no dead ends).
// The one action that is not a link (a form with its button) is handed in as `action` and sits beside the line, never inside it: a paragraph
// cannot hold a form, so the browser moved it out, the page no longer matched what React drew, and React drew the whole page again once its
// scripts arrived, dropping whatever had been pressed or typed in that moment (the paper screen's "Sign this paper off", 17 Nov 2026).
export function EmptyState({ children, next, action }: { children: React.ReactNode; next?: { href: string; label: string }; action?: React.ReactNode }) {
  return (
    <div className="b-empty text-label" role="status" data-ux="empty" data-block="EmptyState">
      <Icon name="done" size={20} />
      <p>{children}</p>
      {action}
      {next ? (
        <Link href={next.href} className="b-btn" data-empty-action>
          {next.label}
        </Link>
      ) : null}
    </div>
  );
}
