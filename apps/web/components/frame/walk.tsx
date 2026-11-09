"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { doorOf, type DoorKey } from "@/lib/menu";
import type { IconName } from "@/lib/icons";

// The door lit on the bar is the door the walk started from (docs/frontend/SPEC.md §3, "Node contract"): a person who opens an
// Activity from Today stays in Today, where the same Activity opened from Setup would light Setup. A door the person
// clicks starts a walk; any other link inside the frame keeps the walk going; a page opened any other way (typed, a
// bookmark) belongs to the door its route is mapped to (lib/menu.ts), and Back returns to the door that page had.
export type FrameDoor = { key: DoorKey; label: string; href: string; icon: IconName; count?: number };
type Walk = { doors: readonly FrameDoor[]; lit: DoorKey | undefined };
const Ctx = createContext<Walk>({ doors: [], lit: undefined });
export const useWalk = () => useContext(Ctx);

const STORE = "cs.walk";

function remembered(path: string): DoorKey | undefined {
  try {
    const w = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as { door: DoorKey; to: string; at: number } | null;
    return w && w.to === path && Date.now() - w.at < 15_000 ? w.door : undefined;
  } catch {
    return undefined;
  }
}

export function WalkProvider({ doors, children }: { doors: readonly FrameDoor[]; children: ReactNode }) {
  const path = usePathname();
  const shown = (k: DoorKey | undefined) => (k && doors.some((d) => d.key === k) ? k : undefined);
  const [lit, setLit] = useState<DoorKey | undefined>(() => shown(doorOf(path)?.key));
  const current = useRef<DoorKey | undefined>(lit);
  const pending = useRef<DoorKey | undefined>(undefined);
  const seen = useRef(new Map<string, DoorKey | undefined>());

  useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.origin !== location.origin || e.defaultPrevented || e.button !== 0) return;
      const door = (a.dataset.door as DoorKey | undefined) ?? current.current;
      pending.current = door;
      try {
        if (door) sessionStorage.setItem(STORE, JSON.stringify({ door, to: a.pathname, at: Date.now() }));
      } catch {
        // a private window may refuse storage: a full page load then falls back to the route's own door
      }
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);

  useEffect(() => {
    const next = shown(pending.current ?? seen.current.get(path) ?? remembered(path) ?? doorOf(path)?.key);
    pending.current = undefined;
    seen.current.set(path, next);
    current.current = next;
    // the lit door follows the walk after the page has changed: a render cannot read the click that caused it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLit(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return <Ctx.Provider value={{ doors, lit }}>{children}</Ctx.Provider>;
}
