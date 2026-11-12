"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { sectionOf, type SectionKey } from "@/lib/menu";
import type { IconName } from "@/lib/icons";

// The section lit in the sidebar is the section the walk started from (docs/frontend/SPEC.md §3, "Node contract"): a person who opens an
// Activity from Today stays in My day, where the same Activity opened from School would light School. A sidebar link the person clicks
// starts a walk in its section; any other link inside the frame keeps the walk going; a page opened any other way (typed, a bookmark)
// belongs to the section its route is mapped to (lib/menu.ts), and Back returns to the section that page had.
/** `counted`: the page whose link carries the one count on the site (Today), drawn when it arrives (`Walk.waiting`). */
export type FramePage = { href: string; label: string; counted?: boolean };
export type FrameSection = { key: SectionKey; label: string; icon: IconName; pages: readonly FramePage[] };
/** `waiting`: the Today count, still on its way: the layout starts it and does not wait for it, so a page's first byte is not held by
 *  the school's counts (p6 measured 1.3 s before the first byte on a slow runner, 12 Nov 2026); the badge reads it with `use`. */
type Walk = { sections: readonly FrameSection[]; lit: SectionKey | undefined; waiting: Promise<number> };
const NONE = Promise.resolve(0);
const Ctx = createContext<Walk>({ sections: [], lit: undefined, waiting: NONE });
export const useWalk = () => useContext(Ctx);

const STORE = "cs.walk";

function remembered(path: string): SectionKey | undefined {
  try {
    const w = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as { section: SectionKey; to: string; at: number } | null;
    return w && w.to === path && Date.now() - w.at < 15_000 ? w.section : undefined;
  } catch {
    return undefined;
  }
}

export function WalkProvider({ sections, waiting = NONE, children }: { sections: readonly FrameSection[]; waiting?: Promise<number>; children: ReactNode }) {
  const path = usePathname();
  const shown = (k: SectionKey | undefined) => (k && sections.some((d) => d.key === k) ? k : undefined);
  const [lit, setLit] = useState<SectionKey | undefined>(() => shown(sectionOf(path)?.key));
  const current = useRef<SectionKey | undefined>(lit);
  const pending = useRef<SectionKey | undefined>(undefined);
  const seen = useRef(new Map<string, SectionKey | undefined>());

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.origin !== location.origin || e.defaultPrevented || e.button !== 0) return;
      const section = (a.dataset.menuSection as SectionKey | undefined) ?? current.current;
      pending.current = section;
      try {
        if (section) sessionStorage.setItem(STORE, JSON.stringify({ section, to: a.pathname, at: Date.now() }));
      } catch {
        // a private window may refuse storage: a full page load then falls back to the route's own section
      }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);

  useEffect(() => {
    const next = shown(pending.current ?? seen.current.get(path) ?? remembered(path) ?? sectionOf(path)?.key);
    pending.current = undefined;
    seen.current.set(path, next);
    current.current = next;
    // the lit section follows the walk after the page has changed: a render cannot read the click that caused it
    setLit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return <Ctx.Provider value={{ sections, lit, waiting }}>{children}</Ctx.Provider>;
}
