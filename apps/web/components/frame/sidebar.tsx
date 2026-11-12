"use client";

import NextLink from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/lib/icons";
import { sideItemOf, type DoorKey } from "@/lib/menu";

// The left sidebar (docs/frontend/page-charter.md A1): the teacher's jobs in sections, always in view beside the page. From 701 px wide
// it is a column that folds to icons (the choice is remembered in this browser); on a phone it is a drawer the bar's Menu button opens,
// closed again by a link, Escape or the dim behind it. The count on Today is the one number the menu carries (docs/ux-rules.md rule 5).
export type SideLink = { label: string; href: string; icon: IconName; door: DoorKey; key: string; count?: number };
export type SideGroup = { key: string; label: string; links: readonly SideLink[] };

type Ctx = { drawer: boolean; setDrawer: (v: boolean) => void; folded: boolean; setFolded: (v: boolean) => void };
const SideCtx = createContext<Ctx>({ drawer: false, setDrawer: () => {}, folded: false, setFolded: () => {} });
const STORE = "cs.sidebar.folded";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [folded, setFoldedState] = useState(false);
  useEffect(() => {
    try {
      setFoldedState(localStorage.getItem(STORE) === "1");
    } catch {
      // storage refused: the menu starts open
    }
  }, []);
  const setFolded = (v: boolean) => {
    setFoldedState(v);
    try {
      localStorage.setItem(STORE, v ? "1" : "0");
    } catch {
      // not remembered
    }
  };
  return <SideCtx.Provider value={{ drawer, setDrawer, folded, setFolded }}>{children}</SideCtx.Provider>;
}

/** The bar's Menu button: a phone only (the column is always there from 701 px). */
export function MenuButton() {
  const { drawer, setDrawer } = useContext(SideCtx);
  return (
    <button
      type="button"
      data-menu-button
      aria-expanded={drawer}
      aria-controls="sidebar"
      onClick={() => setDrawer(!drawer)}
      className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] text-[var(--ink)] min-[701px]:hidden"
    >
      <span aria-hidden="true" className="text-[20px] leading-none">☰</span>
      <span className="sr-only">Menu</span>
    </button>
  );
}

export function Sidebar({ groups }: { groups: readonly SideGroup[] }) {
  const path = usePathname();
  const { drawer, setDrawer, folded, setFolded } = useContext(SideCtx);
  const here = sideItemOf(path)?.href;
  useEffect(() => setDrawer(false), [path, setDrawer]);
  useEffect(() => {
    if (!drawer) return;
    const away = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", away);
    return () => document.removeEventListener("keydown", away);
  }, [drawer, setDrawer]);
  return (
    <>
      {drawer ? <div data-sidebar-dim aria-hidden="true" onClick={() => setDrawer(false)} className="fixed inset-0 z-40 bg-black/40 min-[701px]:hidden" /> : null}
      <aside
        id="sidebar"
        data-sidebar
        data-folded={folded ? "" : undefined}
        data-drawer={drawer ? "open" : "shut"}
        className={`${drawer ? "max-[700px]:flex" : "max-[700px]:hidden"} fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] flex-col gap-[var(--space-3)] overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] p-[var(--space-2)] min-[701px]:sticky min-[701px]:top-0 min-[701px]:z-20 min-[701px]:flex min-[701px]:h-dvh min-[701px]:max-w-none min-[701px]:shrink-0 min-[701px]:self-start print:hidden ${folded ? "min-[701px]:w-[64px]" : "min-[701px]:w-[240px]"}`}
      >
        <nav aria-label="Sections" className="grid gap-[var(--space-3)]">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label} data-section={g.key} className="grid gap-[2px]">
              <h2 className={`px-[var(--space-2)] pb-[2px] text-[length:var(--text-label)] uppercase tracking-wide text-[var(--ink-muted)] ${folded ? "min-[701px]:sr-only" : ""}`}>{g.label}</h2>
              <ul className="grid gap-[2px]">
                {g.links.map((l) => {
                  const lit = l.href === here || l.key === here;
                  return (
                    <li key={l.key}>
                      <NextLink
                        href={l.href}
                        data-door={l.door}
                        data-side={l.key}
                        title={folded ? l.label : undefined}
                        aria-current={lit ? "page" : undefined}
                        aria-describedby={l.count ? `waiting-${l.key}` : undefined}
                        className={`flex min-h-[var(--tap)] items-center gap-[var(--space-2)] rounded-[var(--radius-control)] px-[var(--space-2)] text-[length:var(--text-body)] no-underline hover:bg-[var(--surface)] ${lit ? "bg-[var(--surface)] font-medium text-[var(--ink)] shadow-[inset_3px_0_0_var(--brand-clay)]" : "text-[var(--ink)]"}`}
                      >
                        <Icon name={l.icon} size={20} />
                        <span className={folded ? "min-[701px]:sr-only" : ""}>{l.label}</span>
                        {l.count ? (
                          <span data-testid="waiting" data-count={l.label} aria-hidden="true" className="ml-auto min-w-[20px] rounded-[var(--radius-pill)] bg-[var(--state-late)] px-[5px] text-center text-[length:var(--text-label)] text-[var(--panel)] tabular-nums">
                            {l.count.toLocaleString("en-IN")}
                          </span>
                        ) : null}
                      </NextLink>
                      {l.count ? (
                        <span id={`waiting-${l.key}`} className="sr-only">
                          {l.count.toLocaleString("en-IN")} waiting
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
        <button
          type="button"
          data-sidebar-fold
          aria-expanded={!folded}
          onClick={() => setFolded(!folded)}
          className="mt-auto hidden min-h-[var(--tap)] cursor-pointer items-center gap-[var(--space-2)] rounded-[var(--radius-control)] px-[var(--space-2)] text-[length:var(--text-label)] text-[var(--ink-muted)] hover:bg-[var(--surface)] min-[701px]:flex"
        >
          <span aria-hidden="true">{folded ? "»" : "«"}</span>
          <span className={folded ? "sr-only" : ""}>{folded ? "Open the menu" : "Fold the menu to icons"}</span>
        </button>
      </aside>
    </>
  );
}
