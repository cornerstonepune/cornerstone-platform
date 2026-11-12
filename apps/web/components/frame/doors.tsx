"use client";

import NextLink from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { GROUPS, locate, pagesOf, type MenuPage } from "@/lib/menu";
import { guideFor } from "@/lib/guide-path";
import { useWalk, type FrameDoor } from "./walk";

// The four doors (Today, Timetable, Children, Setup): along the top bar from 701 px wide, a tab bar at the foot of a phone.
// Only the doors pre-load, as the old menu's did. The lit door is the walk's own (walk.tsx); the count on Today is the one
// number the bar carries (docs/ux-rules.md rule 5).
const bar = "relative flex min-h-[var(--tap)] items-center gap-[var(--space-1)] px-[var(--space-2)] text-[length:var(--text-body)] no-underline";

/** The count is the door's description, not its name: the badge is drawn in the link, its words sit beside the link (aria-describedby). */
function Count({ door }: { door: FrameDoor }) {
  if (!door.count) return null;
  return (
    <span data-testid="waiting" data-count={door.label} aria-hidden="true" className="min-w-[20px] rounded-[var(--radius-pill)] bg-[var(--state-late)] px-[5px] text-center text-[length:var(--text-label)] text-[var(--panel)] tabular-nums">
      {door.count.toLocaleString("en-IN")}
    </span>
  );
}
const Said = ({ door }: { door: FrameDoor }) =>
  door.count ? (
    <span id={`waiting-${door.key}`} className="sr-only">
      {door.count.toLocaleString("en-IN")} waiting
    </span>
  ) : null;

/** The doors along the top bar. */
export function TopDoors() {
  const { doors, lit } = useWalk();
  return (
    <nav aria-label="Sections" className="flex min-w-0 items-stretch gap-[var(--space-1)] max-[700px]:hidden">
      {doors.map((d) => (
        <Fragment key={d.key}>
        <NextLink
          href={d.href}
          data-door={d.key}
          aria-current={d.key === lit ? "page" : undefined}
          aria-describedby={d.count ? `waiting-${d.key}` : undefined}
          className={`${bar} whitespace-nowrap ${d.key === lit ? "font-medium text-[var(--ink)] shadow-[inset_0_-3px_0_var(--brand-clay)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
        >
          <Icon name={d.icon} size={20} />
          {d.label}
          <Count door={d} />
        </NextLink>
        <Said door={d} />
        </Fragment>
      ))}
    </nav>
  );
}

/** The same four doors at the foot of a phone: icon above word, at least 44 px tall, the chosen door's icon in brand clay and its word in ink. */
export function BottomDoors() {
  const { doors, lit } = useWalk();
  return (
    <nav aria-label="Sections" data-bar="doors" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--panel)] pb-[env(safe-area-inset-bottom)] min-[701px]:hidden print:hidden">
      <ul className="grid grid-flow-col auto-cols-fr">
        {doors.map((d) => (
          <li key={d.key}>
            <NextLink
              href={d.href}
              data-door={d.key}
              aria-current={d.key === lit ? "page" : undefined}
              aria-describedby={d.count ? `waiting-${d.key}` : undefined}
              className="flex min-h-[var(--tap)] flex-col items-center justify-center gap-[2px] px-[var(--space-1)] py-[var(--space-1)] text-[length:var(--text-label)] text-[var(--ink)] no-underline"
            >
              <span className={d.key === lit ? "text-[var(--brand-clay)]" : "text-[var(--ink-muted)]"}>
                <Icon name={d.icon} size={24} />
              </span>
              <span className={d.key === lit ? "font-medium" : ""}>{d.label}</span>
            </NextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One page of the lit door: a row of the pages panel, marked when it is the page you are on. */
function PageLink({ page, here }: { page: MenuPage; here: string | undefined }) {
  return (
    <Link
      href={page.href}
      aria-current={page.href === here ? "page" : undefined}
      className={`flex min-h-[var(--tap)] items-center whitespace-nowrap rounded-[var(--radius-control)] px-[var(--space-2)] text-[length:var(--text-body)] no-underline hover:bg-[var(--surface)] ${page.href === here ? "font-medium text-[var(--ink)] shadow-[inset_3px_0_0_var(--brand-clay)]" : "text-[var(--ink)]"}`}
    >
      {page.label}
    </Link>
  );
}

/** The pages of the lit door. The wireframes draw one nav row (the bar) and no row of tabs under it (Nimish, 11 Nov 2026), so a door's
 *  other pages fold behind one button at the end of the trail ("Setup pages"), a bordered button, not grey text. Where a page's rail
 *  holds the door's pages already (`Rail doorRail`, the Timetable door) the fold is for a narrow screen only (globals.css); it opens a panel over the page, grouped where the door's
 *  pages name a group, and closes on a page, on Escape or on a click outside. The page you are on is marked in it. */
export function DoorPages() {
  const path = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const shut = openAt !== path;
  const box = useRef<HTMLElement>(null);
  const { lit } = useWalk();
  const door = GROUPS.find((g) => g.key === lit);
  const pages = pagesOf(door);
  const here = locate(path)?.page.href;
  useEffect(() => {
    if (shut) return;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpenAt(null);
    };
    document.addEventListener("keydown", away);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", away);
      document.removeEventListener("pointerdown", away);
    };
  }, [shut]);
  if (!pages.length) return null;
  const headings = [...new Set(pages.map((p) => p.group).filter((g): g is string => Boolean(g)))];
  const list = (ps: readonly MenuPage[], label?: string) => (
    <ul className="grid gap-[2px]" aria-label={label}>
      {ps.map((p) => (
        <li key={p.href}>
          <PageLink page={p} here={here} />
        </li>
      ))}
    </ul>
  );
  return (
    <nav ref={box} aria-label="Pages in this section" data-door-pages className="relative ml-auto shrink-0 print:hidden">
      <button
        type="button"
        aria-expanded={!shut}
        aria-controls="door-pages"
        onClick={() => setOpenAt(shut ? path : null)}
        className="inline-flex min-h-[var(--tap)] cursor-pointer items-center gap-[var(--space-1)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-3)] text-[length:var(--text-body)] font-medium text-[var(--ink)] hover:bg-[var(--surface)]"
      >
        {/* the site's fold marker, first, as every fold draws it: ▸ folded, ▾ open */}
        <span aria-hidden="true">{shut ? "▸" : "▾"}</span>
        {door?.label} pages
      </button>
      <div
        id="door-pages"
        hidden={shut}
        className={`absolute right-0 z-40 mt-1 max-h-[70dvh] w-max max-w-[min(92vw,640px)] overflow-y-auto rounded-[var(--radius-card)] bg-[var(--panel)] p-[var(--space-2)] shadow-[var(--shadow-card)] ${headings.length > 1 ? "grid grid-cols-1 gap-[var(--space-3)] min-[701px]:grid-cols-3" : ""}`}
      >
        {headings.length
          ? headings.map((h) => (
              <div key={h} className="min-w-[180px]">
                <span aria-hidden="true" className="block px-[var(--space-2)] pb-[var(--space-1)] text-[length:var(--text-label)] uppercase tracking-wide text-[var(--ink-muted)]">{h}</span>
                {list(pages.filter((p) => p.group === h), h)}
              </div>
            ))
          : list(pages)}
      </div>
    </nav>
  );
}

/** "?": the guide at this page's section (the guide's own pages: the guide's front). */
export function HelpLink() {
  const href = guideFor(usePathname());
  return (
    <Link href={href} aria-label="Help" title="How this page works" data-ux="help" className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center gap-[var(--space-1)] text-[var(--ink)] no-underline">
      <Icon name="help" size={20} />
    </Link>
  );
}
