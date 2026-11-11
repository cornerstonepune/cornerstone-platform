"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** At phone width a timetable with no view chosen opens on its Day view (docs/frontend/SPEC.md, Timetable); a person who chose a view
 *  keeps it. It only rewrites the address once, so the Day tab and the grid agree and the back button is not trapped. */
export function DayOnPhone({ chosen }: { chosen: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (chosen || !window.matchMedia("(max-width: 640px)").matches) return;
    const q = new URLSearchParams(params.toString());
    q.set("view", "day");
    router.replace(`${path}?${q}`);
  }, [chosen, params, path, router]);
  return null;
}
