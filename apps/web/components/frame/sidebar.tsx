"use client";

import NextLink from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/lib/icons";
import { FOLD_COOKIE, locate } from "@/lib/menu";
import { useWalk, type FrameSection } from "./walk";

// The menu (docs/frontend/page-charter.md A1): a left sidebar, always there from 701 px wide, its pages grouped under the educator's
// jobs. It folds to its icons (one per section, opening the section's first page) and the fold is kept in a cookie, so the next page
// draws it the same way from the server with no jump. On a phone it is a drawer: the menu button at the left of the bar opens it as a
// modal dialog (focus moves in and stays; Escape, the close button, the backdrop or a link close it, and focus returns to the button).
// The page you are on is marked `aria-current="page"`; the section of the walk is lit. Only Today carries a count (docs/ux-rules.md rule 5).

const link =
  "flex min-h-[var(--tap)] items-center gap-[var(--space-2)] rounded-[var(--radius-control)] px-[var(--space-2)] text-[length:var(--text-body)] no-underline hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]";

/** The count is the link's description, not its name: the badge is drawn in the link, its words sit beside it (aria-describedby). */
function Count({ n, id }: { n?: number; id: string }) {
  if (!n) return null;
  return (
    <>
      <span data-testid="waiting" data-count="Today" aria-hidden="true" className="ml-auto min-w-[20px] rounded-[var(--radius-pill)] bg-[var(--state-late)] px-[5px] text-center text-[length:var(--text-label)] text-[var(--panel)] tabular-nums">
        {n.toLocaleString("en-IN")}
      </span>
      <span id={id} className="sr-only">
        {n.toLocaleString("en-IN")} waiting
      </span>
    </>
  );
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
        <li key={s.key} data-section-group={s.key} data-lit={s.key === lit ? "" : undefined}>
          <h2 id={`${idp}-${s.key}`} className={`flex items-center font-sans gap-[var(--space-1)] px-[var(--space-2)] pb-[var(--space-1)] text-[length:var(--text-eyebrow)] tracking-[0.08em] uppercase ${s.key === lit ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}`}>
            <Icon name={s.icon} size={16} />
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
                    aria-describedby={p.count ? id : undefined}
                    className={`${link} ${on ? "bg-[var(--surface)] font-medium text-[var(--ink)] shadow-[inset_3px_0_0_var(--brand-clay)]" : "text-[var(--ink)]"}`}
                  >
                    {p.label}
                    <Count n={p.count} id={id} />
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
        <li key={s.key} data-section-group={s.key} data-lit={s.key === lit ? "" : undefined}>
          <NextLink
            href={s.pages[0].href}
            data-menu-section={s.key}
            aria-label={s.label}
            title={s.label}
            aria-current={s.key === lit ? "true" : undefined}
            className={`${link} justify-center ${s.key === lit ? "bg-[var(--surface)] text-[var(--brand-clay)]" : "text-[var(--ink-muted)]"}`}
          >
            <Icon name={s.icon} size={24} />
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
      className={`sticky top-0 hidden max-h-dvh shrink-0 self-start overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] p-[var(--space-2)] min-[701px]:block print:hidden ${folded ? "w-[72px]" : "w-[224px]"}`}
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
        className="m-0 h-dvh max-h-dvh w-[min(85vw,320px)] max-w-none bg-[var(--panel)] p-[var(--space-3)] text-[var(--ink)] shadow-[var(--shadow-card)] backdrop:bg-black/40 min-[701px]:hidden"
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
