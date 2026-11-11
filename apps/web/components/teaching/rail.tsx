import { screenHref } from "@/lib/built";
import { KindLink, type Kind } from "@/components/kind-tile";
import { CaptureHere } from "@/components/app-frame";

// The rail of a teaching screen (UI-3c): "Connected to" as the wireframe draws it, each link a kind tile with a second line saying what
// it is to this page ("the objective", "to lay out"), then whatever cards the page adds (its fortnights), then Capture here. A link
// to a screen that is not built is not drawn, as `Rail` does (lib/built.ts); `href` is for an address the page knows.
export type RailLink = { kind: Kind; screen: string; params?: Record<string, string>; label: string; note: string; href?: string; fallback?: string };

export function TeachingRail({ links, children, capture }: { links: readonly RailLink[]; children?: React.ReactNode; capture?: React.ReactNode }) {
  const drawn = links.map((l) => ({ ...l, to: l.href ?? screenHref(l.screen, l.params) ?? l.fallback ?? null })).filter((l): l is typeof l & { to: string } => l.to !== null);
  return (
    <>
      {drawn.length ? (
        <section aria-label="Connected to" className="grid gap-[var(--space-1)]">
          <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">Connected to</h2>
          <ul className="b-rlist">
            {drawn.map((l) => (
              <li key={`${l.to}-${l.label}-${l.note}`}>
                <KindLink kind={l.kind} href={l.to} note={l.note}>
                  {l.label}
                </KindLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {children}
      {capture ? <CaptureHere>{capture}</CaptureHere> : null}
    </>
  );
}

/** The rail's box: the surface beside the main column (below it on a phone). */
export function RailAside({ children }: { children: React.ReactNode }) {
  return (
    <aside aria-label="Rail" data-rail className="grid content-start gap-[var(--space-3)] rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
      {children}
    </aside>
  );
}
