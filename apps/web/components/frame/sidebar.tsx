"use client";

import NextLink from "next/link";
import { Suspense, use, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/lib/icons";
import { FOLD_COOKIE, locate } from "@/lib/menu";
import { useWalk, type FrameSection } from "./walk";

// The menu (docs/frontend/page-charter.md A1): a left sidebar, always there from 701 px wide, its pages grouped under the educator's
// jobs. It folds to its icons (one per section, opening the section's first page) and the fold is kept in a cookie, so the next page
// draws it the same way from the server with no jump. On a phone it is a drawer: the menu button at the left of the bar opens it as a
// modal dialog (focus moves in and stays; Escape, the close button, the backdrop or a link close it, and focus returns to the button).
// The page you are on is marked `aria-current="page"` and filled with its section's tint; the section of the walk is lit. Only Today carries a count (docs/ux-rules.md rule 5).

const link =
  "flex min-h-[var(--tap)] items-center gap-[var(--space-2)] rounded-[var(--radius-control)] px-[var(--space-2)] text-[length:var(--text-body)] no-underline transition-colors duration-100 hover:bg-[var(--panel)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]";

// Each section has its own colour, from the tokens (13 Nov 2026, "the left panel is bleak"): its icon sits in a tile of that colour and the
// page you are on is filled with its tint. One formula for every section, so a new section is one line here.
const HUE: Record<string, string> = {
  today: "var(--brand-clay)",
  timetable: "var(--subject-numeracy)",
  children: "var(--kind-child)",
  assessments: "var(--kind-objective)",
  school: "var(--brand-olive)",
};
const hue = (key: string) => ({ "--sc": HUE[key] ?? "var(--ink-muted)" }) as CSSProperties;
const TILE =
  "inline-flex size-[28px] shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[color-mix(in_srgb,var(--sc)_14%,var(--panel))] text-[var(--sc)]";
const ON = "bg-[color-mix(in_srgb,var(--sc)_14%,var(--panel))] font-semibold text-[var(--ink)]";

/** The count is the link's description, not its name: the badge is drawn in the link, its words sit beside it (aria-describedby,
 *  on a span that is always there, so the reference never dangles). It arrives after the page (`useWalk().waiting`). */
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
    <span data-testid="waiting" data-count="Today" aria-hidden="true" className="ml-auto min-w-[20px] rounded-[var(--radius-pill)] bg-[var(--state-late)] px-[5px] text-center text-[length:var(--text-label)] text-[var(--panel)] tabular-nums">
      {n.toLocaleString("en-IN")}
    </span>
  );
}

function Words() {
  const n = use(useWalk().waiting);
  return n ? <>{n.toLocaleString("en-IN")} waiting</> : null;
}

/** The page of the menu an address is: its path and, on the timetable, its view. */
function useHere(): string | undefined {
  const path = usePathname();
  const view = useSearchParams().get("view");
  return locate(view ? `${path}?view=${view}` : path)?.page.href;
}

/** The sections and their pages, open (the sidebar unfolded, and the phone's drawer). */
function Open({ sections, lit, here, idp }: { sections: readonly FrameSection[]; lit?: string; here?: string; idp: string }) {
  return (
    <ul className="grid gap-[var(--space-3)]">
      {sections.map((s) => (
        <li key={s.key} data-section-group={s.key} data-lit={s.key === lit ? "" : undefined} style={hue(s.key)}>
          <h2 id={`${idp}-${s.key}`} className={`flex items-center font-sans gap-[var(--space-2)] px-[var(--space-1)] pb-[var(--space-1)] text-[length:var(--text-label)] font-semibold ${s.key === lit ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
            <span className={TILE} aria-hidden="true">
              <Icon name={s.icon} size={16} />
            </span>
            {s.label}
          </h2>
          <ul aria-labelledby={`${idp}-${s.key}`} className="grid gap-[2px]">
            {s.pages.map((p, i) => {
              const on = p.href === here;
              const id = `${idp}-waiting-${s.key}`;
              return (
                <li key={p.href}>
                  <NextLink
                    href={p.href}
                    // only a section's first page loads ahead, as the four doors did (components/link.tsx says why)
                    prefetch={i === 0 ? undefined : false}
                    data-menu-section={s.key}
                    aria-current={on ? "page" : undefined}
                    aria-describedby={p.counted ? id : undefined}
                    className={`${link} pl-[calc(var(--space-2)+28px+var(--space-2)-var(--space-1))] ${on ? ON : "text-[var(--ink)]"}`}
                  >
                    {p.label}
                    {p.counted ? <Count id={id} /> : null}
                  </NextLink>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Folded: one icon per section, opening its first page; its name is said and shown on hover. */
function Folded({ sections, lit }: { sections: readonly FrameSection[]; lit?: string }) {
  return (
    <ul className="grid gap-[var(--space-1)]">
      {sections.map((s) => (
        <li key={s.key} data-section-group={s.key} data-lit={s.key === lit ? "" : undefined} style={hue(s.key)}>
          <NextLink
            href={s.pages[0].href}
            data-menu-section={s.key}
            aria-label={s.label}
            title={s.label}
            aria-current={s.key === lit ? "true" : undefined}
            className={`${link} justify-center ${s.key === lit ? "bg-[color-mix(in_srgb,var(--sc)_12%,var(--panel))]" : ""}`}
          >
            <span className={TILE} aria-hidden="true">
              <Icon name={s.icon} size={18} />
            </span>
          </NextLink>
        </li>
      ))}
    </ul>
  );
}

/** The sidebar from 701 px wide: sticky under the bar, its own scroll, folding to icons. */
export function Sidebar({ folded: start }: { folded: boolean }) {
  const { sections, lit } = useWalk();
  const here = useHere();
  const [folded, setFolded] = useState(start);
  // ids made per frame, so a frame drawn inside another (the blocks gallery's sample) never repeats one
  const uid = useId();
  const fold = () => {
    const next = !folded;
    setFolded(next);
    document.cookie = `${FOLD_COOKIE}=${next ? "icons" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div
      data-sidebar
      data-folded={folded ? "" : undefined}
      className={`sticky top-0 hidden max-h-dvh shrink-0 self-start overflow-y-auto border-r border-[var(--line)] bg-[var(--menu)] p-[var(--space-2)] min-[701px]:block print:hidden ${folded ? "w-[72px]" : "w-[240px]"}`}
    >
      <button
        type="button"
        onClick={fold}
        aria-expanded={!folded}
        aria-controls={`${uid}-nav`}
        aria-label={folded ? "Open the menu" : "Fold the menu to icons"}
        title={folded ? "Open the menu" : "Fold the menu to icons"}
        className={`${link} mb-[var(--space-2)] w-full cursor-pointer text-[var(--ink-muted)] ${folded ? "justify-center" : "justify-end"}`}
      >
        <Icon name={folded ? "expand" : "collapse"} size={20} />
      </button>
      <nav id={`${uid}-nav`} aria-label="Menu">
        {folded ? <Folded sections={sections} lit={lit} /> : <Open sections={sections} lit={lit} here={here} idp={`${uid}-side`} />}
      </nav>
    </div>
  );
}

/** The phone's menu: a button at the left of the bar, and the sections in a drawer (a modal dialog) from the left. */
export function MenuDrawer() {
  const { sections, lit } = useWalk();
  const here = useHere();
  const path = usePathname();
  const box = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const uid = useId();
  // a page change closes the drawer (a link inside it was followed)
  useEffect(() => {
    box.current?.close();
  }, [path]);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${uid}-drawer`}
        aria-label="Menu"
        onClick={() => box.current?.showModal()}
        className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-[var(--ink)] min-[701px]:hidden print:hidden"
        data-menu-button
      >
        <Icon name="menu" size={24} />
      </button>
      <dialog
        ref={box}
        id={`${uid}-drawer`}
        data-menu-drawer
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onToggle={() => setOpen(!!box.current?.open)}
        onClick={(e) => {
          // a click on the backdrop (the dialog itself, outside its panel) closes it; a link inside closes it by changing the page
          if (e.target === box.current) box.current.close();
        }}
        className="m-0 h-dvh max-h-dvh w-[min(85vw,320px)] max-w-none bg-[var(--menu)] p-[var(--space-3)] text-[var(--ink)] shadow-[var(--shadow-card)] backdrop:bg-black/40 min-[701px]:hidden"
      >
        <div className="mb-[var(--space-3)] flex items-center justify-between">
          <span className="text-[length:var(--text-label)] tracking-[0.08em] text-[var(--ink-muted)] uppercase">Menu</span>
          <button type="button" onClick={() => box.current?.close()} aria-label="Close the menu" className={`${link} cursor-pointer`}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <nav aria-label="Menu" data-drawer>
          <Open sections={sections} lit={lit} here={here} idp={`${uid}-drawer`} />
        </nav>
      </dialog>
    </>
  );
}
