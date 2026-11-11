import type { ReactNode } from "react";
import Link from "@/components/link";
import { BrandMark } from "./brand-mark";
import { BottomDoors, DoorPages, HelpLink, TopDoors } from "./frame/doors";
import { ActingAsSwitch, AccountLink, Person } from "./frame/person";
import { MapLink, ReportLink } from "./frame/foot-links";
import { SearchBox } from "./frame/search-box";
import { WalkProvider, type FrameDoor } from "./frame/walk";
import { Body, PageHeader, classesSaid } from "./parts";
import { Icon } from "@/lib/icons";
import { signOut } from "@/lib/auth-actions";
import type { Session } from "@/lib/auth";
import { mayUse } from "@/lib/access";
import { GROUPS } from "@/lib/menu";
import { isBuilt, screenHref } from "@/lib/built";
import { actingAsEducator } from "@/lib/acting-view";

// AppFrame (docs/frontend/SPEC.md §5, UI-13): the one frame of every signed-in page. The bar across the top (the school's logo, a
// link to Today; the four doors; search; acting as; help; sign out), the trail and the main column below it, and on a phone
// the four doors at the foot. The page itself is `Screen`, which holds the title, the one main action, the rail and the next
// step. Nimish, 24 Oct 2026: "the menu can be on the top" — there is no sidebar. Nothing here names a subject.

/** A door opens its screen once that screen is built (lib/built.ts), and the first page of the door until then. */
function doorsFor(me: Session, acting: boolean, waiting: number): FrameDoor[] {
  // Setup is every member of staff's today (lib/access.ts, ux9c-one-role); acting as an educator is a view that puts it away
  const setup = mayUse(me, "setup") && !acting;
  return GROUPS.filter((d) => !d.setup || setup).map((d) => ({
    key: d.key,
    label: d.label,
    icon: d.icon,
    href: (isBuilt(d.screen) ? screenHref(d.screen) : null) ?? d.href,
    count: d.key === "today" && waiting ? waiting : undefined,
  }));
}

export async function AppFrame({ me, waiting, children }: { me: Session; waiting: number; children: ReactNode }) {
  const acting = await actingAsEducator(me);
  const doors = doorsFor(me, acting, waiting);
  return (
    <WalkProvider doors={doors}>
      <div data-block="AppFrame" data-frame className="flex min-h-dvh flex-col bg-[var(--ground)] pb-[var(--space-7)] text-[var(--ink)] min-[701px]:pb-0">
        <header data-bar className="relative z-30 border-b border-[var(--line)] bg-[var(--panel)] print:hidden">
          <div className="mx-auto flex h-16 w-full max-w-[1560px] items-center gap-[var(--space-3)] px-[var(--space-3)] min-[701px]:gap-[var(--space-4)] md:px-[var(--space-4)]">
            <Link href="/today" prefetch className="flex shrink-0 items-center no-underline">
              <BrandMark />
            </Link>
            <TopDoors />
            <div className="ml-auto flex min-w-0 items-center gap-[var(--space-2)] max-[700px]:flex-1 max-[700px]:justify-end">
              <SearchBox />
              <Person name={me.name}>
                <AccountLink name={me.name} classes={classesSaid(me)} />
                {me.role === "coordinator" ? <ActingAsSwitch on={acting} /> : null}
                <HelpLink />
                {me.devBypass ? (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--state-wait-bg)] px-[var(--space-2)] text-[var(--ink)]">dev bypass</span>
                ) : (
                  <form action={signOut} className="contents">
                    <button type="submit" className="inline-flex min-h-[var(--tap)] cursor-pointer items-center gap-[var(--space-1)] whitespace-nowrap rounded-[var(--radius-control)] px-[var(--space-2)] text-[var(--ink)] hover:bg-[var(--surface)]">
                      <Icon name="sign-out" size={20} />
                      Sign out
                    </button>
                  </form>
                )}
              </Person>
            </div>
          </div>
          <DoorPages />
        </header>
        <main className="mx-auto flex w-full min-w-0 max-w-[1560px] flex-1 flex-col">{children}</main>
        <footer className="mx-auto w-full max-w-[1560px] px-[var(--space-3)] py-[var(--space-3)] text-[length:var(--text-label)] md:px-[var(--space-4)] print:hidden">
          <span className="flex flex-wrap gap-x-[var(--space-4)]">
            <ReportLink />
            {mayUse(me, "the_map") ? <MapLink /> : null}
          </span>
        </footer>
        <BottomDoors />
      </div>
    </WalkProvider>
  );
}

type To = { href: string; label: string };

/** Capture here (SPEC §5, CaptureBar): the two ways to record what is in view. Drawn by a screen whose lesson or child is in view. */
export function CaptureHere({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Capture here" data-rail-part="capture">
      <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] tracking-[var(--tracking-eyebrow,0.08em)] text-[var(--ink-muted)] uppercase">Capture here</h2>
      <div className="grid gap-[var(--space-1)]">{children}</div>
    </section>
  );
}

/** The rail: a surface box at the right of the main column (below it on a phone) of "Connected to" edges and, where a lesson or a
 *  child is in view, "Capture here". An edge is a screen id: it is drawn only when that screen is built (lib/built.ts). */
/** `href`: an edge to a screen of the slice being built, whose address the page knows (its screen is not in `merged_slices` yet, so the id alone draws nothing).
 *  `fallback`: the address of the page that does this work today, drawn while the screen is not built (an old page that is still live). */
export type Edge = { screen: string; params?: Record<string, string>; label: string; icon: Parameters<typeof Icon>[0]["name"]; href?: string; newTab?: boolean; fallback?: string };
export function Rail({ edges = [], capture, boxes = [] }: { edges?: Edge[]; capture?: ReactNode; boxes?: { title: string; body: ReactNode }[] }) {
  const drawn = edges.map((e) => ({ ...e, href: e.href ?? screenHref(e.screen, e.params) ?? e.fallback ?? null })).filter((e): e is typeof e & { href: string } => e.href !== null);
  if (!drawn.length && !capture && !boxes.length) return null;
  return (
    <aside aria-label="Rail" data-rail className="grid content-start gap-[var(--space-3)] rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
      {drawn.length ? (
        <section aria-label="Connected to">
          <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">Connected to</h2>
          <ul className="grid gap-[var(--space-1)]">
            {drawn.map((e) => (
              <li key={e.href}>
                <Link href={e.href} {...(e.newTab ? { target: "_blank", rel: "noreferrer" } : {})} className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)] text-[var(--link)] underline">
                  <Icon name={e.icon} size={20} />
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {boxes.map((b) => (
        <section key={b.title} aria-label={b.title}>
          <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">{b.title}</h2>
          {b.body}
        </section>
      ))}
      {capture ? <CaptureHere>{capture}</CaptureHere> : null}
    </aside>
  );
}

/** A page of the educator's site (docs/ux-rules.md rule 1): its title says what it is for, one line says more, ONE main action is
 *  where a thumb finds it, and the page ends on the next step, so there is no dead end. The trail above the title is two
 *  levels, the door and the thing. `details` is where the setup and the numbers for a reader of statistics wait (rule 8); `rail` is
 *  drawn beside the page (below it on a phone). The slots are required props, so a page that leaves one out does not compile;
 *  `purpose` is held to PURPOSE_MAX by tests/test_ux_rules.py and the rendered test. */
export function Screen({
  stage,
  title,
  purpose,
  action,
  next,
  details,
  rail,
  children,
}: {
  stage: string;
  title: string;
  purpose: string;
  /** The one main action; a screen whose main action is one of its own controls marks that control `data-ux="action"` and passes none. */
  action?: ReactNode;
  next?: To | null;
  details?: To;
  rail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader stage={stage} title={title} sub={purpose} />
      <Body>
        <div className={rail ? "grid gap-[var(--space-4)] min-[1000px]:grid-cols-[minmax(0,1fr)_320px]" : undefined}>
          <div className="min-w-0">
            <div className={action !== undefined || details ? "mb-4 flex flex-wrap items-center gap-3" : undefined} data-ux={action !== undefined ? "action" : undefined}>
              {action}
              {details ? (
                <Link href={details.href} className="ml-auto text-[13px]" data-ux="details">
                  {details.label}
                </Link>
              ) : null}
            </div>
            {children}
            {next ? (
              <nav className="mt-6 border-t border-[var(--line)] pt-4" aria-label="Next step">
                <Link href={next.href} className="chip" data-ux="next">
                  {next.label} →
                </Link>
              </nav>
            ) : null}
          </div>
          {rail}
        </div>
      </Body>
    </>
  );
}

/** The bare frame (`frame: bare` in screens.json: Sign in): the logo large and the form, no bar, no trail, no rail. */
export function BareFrame({ children }: { children: ReactNode }) {
  return (
    <main data-frame="bare" className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center bg-[var(--ground)] px-5 py-10 text-[var(--ink)]">
      <div className="mb-[var(--space-5)]">
        <BrandMark size="large" />
      </div>
      {children}
    </main>
  );
}
