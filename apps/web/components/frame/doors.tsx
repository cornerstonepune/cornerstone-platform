"use client";

import NextLink from "next/link";
import { Fragment } from "react";
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { GROUPS, locate, pagesOf } from "@/lib/menu";
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

/** The pages of the lit door, under the bar: a door's other pages are a row here, never more doors. */
export function DoorPages() {
  const path = usePathname();
  const { lit } = useWalk();
  const door = GROUPS.find((g) => g.key === lit);
  const pages = pagesOf(door);
  const here = locate(path)?.page.href;
  if (!pages.length) return null;
  return (
    <nav aria-label="Pages in this section" className="border-t border-[var(--line)] print:hidden">
      <ul className="mx-auto flex w-full max-w-[1560px] gap-[var(--space-1)] overflow-x-auto px-[var(--space-3)] md:px-[var(--space-4)]">
        {pages.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              aria-current={p.href === here ? "page" : undefined}
              className={`flex min-h-[var(--tap)] items-center whitespace-nowrap px-[var(--space-2)] text-[length:var(--text-label)] no-underline ${p.href === here ? "font-medium text-[var(--ink)] shadow-[inset_0_-3px_0_var(--brand-clay)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
            >
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
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
