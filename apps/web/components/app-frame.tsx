import type { ReactNode } from "react";
import Link from "@/components/link";
import { BrandMark } from "./brand-mark";
import { BottomDoors, HelpLink, TopDoors } from "./frame/doors";
import { ActingAsSwitch, AccountLink, Person } from "./frame/person";
import { MapLink, ReportLink } from "./frame/foot-links";
import { SearchBox } from "./frame/search-box";
import { WalkProvider, type FrameDoor } from "./frame/walk";
import { Body, PageHeader, classesSaid } from "./parts";
import { Icon, type IconName as Icon_ } from "@/lib/icons";
import { KeyValue } from "@/components/key-value";
import type { Kind } from "@/components/kind-tile";
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
          <div className="flex h-[72px] w-full items-center gap-[var(--space-3)] px-[var(--space-3)] min-[701px]:gap-[var(--space-4)] md:px-[var(--space-4)]">
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
        </header>
        <main className="flex w-full min-w-0 flex-1 flex-col">{children}</main>
        <footer className="w-full px-[var(--space-3)] py-[var(--space-3)] text-[length:var(--text-label)] md:px-[var(--space-4)] print:hidden">
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

/** The rail, as the wireframes draw it (docs/frontend/wireframes/kit.css `.rail`): at the right of the page (below it on a phone), a stack
 *  of boxes in this order: the child peek when one is chosen, "Connected to" (each edge a kind tile, its name and a caption saying what
 *  it is or where it stands), a facts card where the screen has one, and "Capture here" where a lesson or a child is in view. An edge is a
 *  screen id: it is drawn only when that screen is built (lib/built.ts). */
/** `href`: an edge to a screen of the slice being built, whose address the page knows (its screen is not in `merged_slices` yet, so the id alone draws nothing).
 *  `fallback`: the address of the page that does this work today, drawn while the screen is not built (an old page that is still live).
 *  `line`: the caption under the name ("fortnight 9, week A"); `kind` colours the tile and defaults from the icon. */
export type Edge = { screen: string; params?: Record<string, string>; label: string; icon: Parameters<typeof Icon>[0]["name"]; href?: string; newTab?: boolean; fallback?: string; line?: string; kind?: Kind };

/** The kind (and so the colour) of an edge's tile when the page names none: what the thing it opens is. */
const KIND_OF: Partial<Record<Edge["icon"], Kind>> = {
  class: "child", child: "child", parent: "child", absent: "child",
  week: "period", fortnight: "period", period: "period", today: "period", table: "period", board: "period", moved: "period", clash: "period", frozen: "period", late: "period",
  skill: "skill", tree: "skill", sprout: "skill", leaf: "skill", correct: "skill",
  assessment: "assessment", checklist: "assessment", form: "assessment",
  activity: "activity", materials: "activity", setup: "activity",
  objective: "objective",
  note: "note", record: "note", play: "note",
};
const kindOfEdge = (e: Pick<Edge, "icon" | "kind">): Kind => e.kind ?? KIND_OF[e.icon] ?? "period";

/** The second line of a rail link when the page gives none: what the screen it opens is, in the wireframes' words (docs/frontend/
 *  wireframes, the rails' `<small>`). Words only, never a number: a count is the page's own `line`, read from its rows. */
const LINE_OF: Partial<Record<string, string>> = {
  today: "the day's periods",
  timetable: "the live grid",
  materials: "what to lay out",
  rules: "what the draft reads",
  fortnight: "its plan and its state",
  draft: "from the rules",
  moves: "the next step",
  period: "the period",
  record: "a note about this class",
  notes: "notes to confirm",
  confirm: "notes to confirm",
  children: "every class",
  picture: "the class picture",
  child: "the child",
  assessments: "papers, approvals and results",
  assessment: "the assessment",
  paper: "answers to judge",
  reports: "for parents",
  curriculum: "every grade",
  "skills-approve": "read and approve their levels",
  bank: "the questions papers are made from",
  skill: "the skill",
  skillset: "the skill set",
  objective: "the objective",
  activity: "the activity",
  staff: "who teaches what",
  classes: "classes and children",
  setup: "the school's setup",
  "today-educator": "the day's periods",
};

const BOX = "rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]";

/** A titled box of label and value rows in the rail (This fortnight, Latest notes, Grants open now). Whole counts and words only. */
export function RailFacts({ title, rows }: { title: string; rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <section aria-label={title} data-rail-part="facts" className={BOX}>
      <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">{title}</h2>
      <KeyValue rows={rows.map((r) => ({ label: r.label, value: r.value, num: true }))} />
    </section>
  );
}

/** `doorRail`: the rail holds the lit door's other pages, so the fold at the end of the trail is put away where the rail sits beside the page. */
export function Rail({ edges = [], capture, peek, facts, cards, boxes = [], doorRail }: { edges?: Edge[]; capture?: ReactNode; peek?: ReactNode; facts?: ReactNode; cards?: ReactNode; boxes?: { title: string; body: ReactNode }[]; doorRail?: boolean }) {
  const drawn = edges.map((e) => ({ ...e, href: e.href ?? screenHref(e.screen, e.params) ?? e.fallback ?? null })).filter((e): e is typeof e & { href: string } => e.href !== null);
  if (!drawn.length && !capture && !peek && !facts && !cards && !boxes.length) return null;
  return (
    <aside aria-label="Rail" data-rail data-door-rail={doorRail ? "" : undefined} className="grid content-start gap-[var(--space-4)]">
      {peek}
      {drawn.length ? (
        <section aria-label="Connected to" className={BOX}>
          <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">Connected to</h2>
          <ul className="b-rlist !gap-[var(--space-2)]">
            {drawn.map((e, i) => {
              // the caption describes the link; the link's name stays the screen's own word (a test or a screen reader finds "Notes")
              const line = e.line ?? LINE_OF[e.screen];
              const id = `rail-line-${i}`;
              return (
                <li key={e.href}>
                  <Link href={e.href} {...(e.newTab ? { target: "_blank", rel: "noreferrer" } : {})} className="b-ritem" data-rail-link data-kind={kindOfEdge(e)} aria-describedby={line ? id : undefined}>
                    <span data-block="KindTile" data-kind={kindOfEdge(e)} className="b-tile">
                      <Icon name={e.icon} size={20} />
                    </span>
                    <span>
                      {e.label}
                      {line ? (
                        <small id={id} aria-hidden="true" data-rail-line>
                          {line}
                        </small>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {cards}
      {boxes.map((b) => (
        <section key={b.title} aria-label={b.title} className={BOX}>
          <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">{b.title}</h2>
          {b.body}
        </section>
      ))}
      {facts}
      {capture ? (
        <div className={BOX}>
          <CaptureHere>{capture}</CaptureHere>
        </div>
      ) : null}
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
  stageChip,
  icon,
  title,
  purpose,
  action,
  next,
  details,
  rail,
  children,
}: {
  stage: string;
  /** A state chip beside the small-caps line (the Timetable says Live or Planning there). */
  stageChip?: ReactNode;
  /** The icon before the small-caps line, as the wireframes draw it. */
  icon?: Icon_;
  title: string;
  purpose: string;
  /** The one main action; a screen whose main action is one of its own controls marks that control `data-ux="action"` and passes none. */
  action?: ReactNode;
  next?: To | null;
  details?: To;
  rail?: ReactNode;
  children: ReactNode;
}) {
  // the wireframes' `.page`: the main column (trail, title, purpose, the action, the page) and the rail beside it from the top
  return (
    <Body>
      <div className={rail ? "grid gap-[var(--space-4)] min-[1000px]:grid-cols-[minmax(0,1fr)_320px] min-[1000px]:gap-[var(--space-5)]" : undefined}>
        <div className="min-w-0">
          <PageHeader stage={stage} icon={icon} title={title} sub={purpose} inColumn chip={stageChip} />
          <div className={action !== undefined || details ? "mb-[var(--space-3)] flex flex-wrap items-center gap-3" : undefined} data-ux={action !== undefined ? "action" : undefined}>
            {action}
            {details ? (
              <Link href={details.href} className="ml-auto text-[13px]" data-ux="details">
                {details.label}
              </Link>
            ) : null}
          </div>
          {children}
          {next ? (
            <nav className="mt-[var(--space-4)] border-t border-[var(--line)] pt-[var(--space-3)]" aria-label="Next step">
              <Link href={next.href} className="chip" data-ux="next">
                {next.label} →
              </Link>
            </nav>
          ) : null}
        </div>
        {rail}
      </div>
    </Body>
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
