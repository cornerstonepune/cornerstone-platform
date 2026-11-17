"use client";

import NextLink from "next/link";
import { Suspense, use, useId } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/lib/icons";
import { BAR_KEYS, locate } from "@/lib/menu";
import { useWalk, type FrameSection } from "./walk";

// The menu (CP-66, CP-68, Nimish 17 Nov 2026): one line of links in the terracotta bar across the top, from 901 px wide, so the page below has the
// whole width; under that, a tab bar fixed to the foot of the screen with the same five. Setup is not here: it waits in the person's menu.
// The page you are on is marked `aria-current="page"` as a soft lighter pill on the bar (on a phone: the accent on the white tab bar). Only Today
// carries a count (docs/ux-rules.md rule 5), drawn quiet: grey, small, after the word.

/** The page of the menu an address is: its path and, on the timetable, its view. */
function useHere(): string | undefined {
  const path = usePathname();
  const view = useSearchParams().get("view");
  return locate(view ? `${path}?view=${view}` : path)?.page.href;
}

function useBar(): { sections: FrameSection[]; lit?: string; here?: string } {
  const { sections, lit } = useWalk();
  const here = useHere();
  return { sections: BAR_KEYS.map((k) => sections.find((s) => s.key === k)).filter((s): s is FrameSection => !!s), lit, here };
}

/** The count is the link's description, not its name: the badge is drawn in the link, its words sit beside it (aria-describedby, on a span
 *  that is always there, so the reference never dangles). It arrives after the page (`useWalk().waiting`). */
function Count({ id }: { id: string }) {
  return (
    <>
      <Suspense fallback={null}>
        <Badge />
      </Suspense>
      <span id={id} className="sr-only">
        <Suspense fallback={null}>
          <Words />
        </Suspense>
      </span>
    </>
  );
}

function Badge() {
  const n = use(useWalk().waiting);
  if (!n) return null;
  return (
    <span data-testid="waiting" data-count="Today" aria-hidden="true" className="rounded-[var(--radius-pill)] bg-[var(--bar-badge)] px-[var(--space-1)] text-[length:var(--text-label)] font-normal text-[var(--bar-ink)] tabular-nums">
      {n.toLocaleString("en-IN")}
    </span>
  );
}

function Words() {
  const n = use(useWalk().waiting);
  return n ? <>{n.toLocaleString("en-IN")} waiting</> : null;
}

const isOn = (s: FrameSection, lit?: string, here?: string) => s.key === lit || s.pages[0].href === here;

/** The bar's links, from 901 px wide. */
export function TopNav() {
  const { sections, lit, here } = useBar();
  const uid = useId();
  return (
    <nav aria-label="Menu" data-menu data-topnav className="hidden h-full min-w-0 items-center min-[901px]:flex print:hidden">
      <ul className="flex items-center gap-[var(--space-0)]">
        {sections.map((s, i) => {
          const p = s.pages[0];
          const on = isOn(s, lit, here);
          const id = `${uid}-waiting`;
          return (
            <li key={s.key} data-section-group={s.key} data-lit={s.key === lit ? "" : undefined} className="flex">
              <NextLink
                href={p.href}
                prefetch={i === 0 ? undefined : false}
                data-menu-section={s.key}
                aria-current={on ? "page" : undefined}
                aria-describedby={p.counted ? id : undefined}
                className={`flex min-h-[var(--tap)] items-center gap-[var(--space-1)] whitespace-nowrap rounded-[var(--radius-pill)] px-[var(--space-3)] text-[length:var(--text-body)] no-underline focus-visible:outline-2 focus-visible:outline-[var(--bar-ink)] ${
                  on ? "bg-[var(--bar-pill)] font-semibold text-[var(--bar-pill-ink)] hover:text-[var(--bar-pill-ink)]" : "text-[var(--bar-ink)] hover:bg-[var(--bar-hover)] hover:text-[var(--bar-ink)]"
                }`}
              >
                <span data-section-label>{s.label}</span>
                {p.counted ? <Count id={id} /> : null}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The phone's menu: a tab bar fixed to the foot of the screen, five tabs at most, under 901 px. */
export function TabBar() {
  const { sections, lit, here } = useBar();
  const uid = useId();
  return (
    <nav
      aria-label="Menu"
      data-menu
      data-tabbar
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--panel)] pb-[env(safe-area-inset-bottom)] min-[901px]:hidden print:hidden"
    >
      {/* each tab as wide as its label plus an equal share of what is left: five equal columns clipped "Assessments" at 400 px */}
      <ul className="flex">
        {sections.slice(0, 5).map((s) => {
          const p = s.pages[0];
          const on = isOn(s, lit, here);
          const id = `${uid}-waiting`;
          return (
            <li key={s.key} data-section-group={s.key} data-lit={s.key === lit ? "" : undefined} className="min-w-0 flex-auto">
              <NextLink
                href={p.href}
                prefetch={false}
                data-menu-section={s.key}
                aria-current={on ? "page" : undefined}
                aria-describedby={p.counted ? id : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-[var(--space-0)] px-[var(--space-0)] text-[length:var(--text-label)] no-underline [-webkit-tap-highlight-color:transparent] ${
                  on ? "font-semibold text-[var(--action)]" : "text-[var(--ink-muted)]"
                }`}
              >
                <span className="relative" aria-hidden="true">
                  <Icon name={s.icon} size={22} />
                </span>
                <span data-section-label className="max-w-full truncate">
                  {s.label}
                </span>
                {p.counted ? (
                  <span className="sr-only" id={id}>
                    <Suspense fallback={null}>
                      <Words />
                    </Suspense>
                  </span>
                ) : null}
              </NextLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
