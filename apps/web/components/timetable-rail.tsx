import { Rail, type Edge } from "@/components/app-frame";
import type { ReactNode } from "react";

// The Timetable door's other pages, as the wireframes draw them: "Connected to" in the right rail of every page of the door, each
// with its icon and a second line (docs/frontend/wireframes/timetable.html, fortnight.html). The page charter (A2) moves these links to the
// sidebar; the pages that still draw this rail keep it until their own screen's PR (the week grid already has its detail panel instead).
export type Here = "grid" | "fortnight" | "draft" | "rules" | "materials";

/** The door's pages other than `here`. `fn`: the fortnight in view (its number); `classId`: the class in view. The coordinator's pages
 *  (Draft from the rules, Rules) are drawn only for a coordinator. Words only on the second line, never a count. */
export function timetableEdges(here: Here, o: { fn?: number; classId?: string; coordinator: boolean }): Edge[] {
  const q = (extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...(o.fn ? { fn: String(o.fn) } : {}), ...(o.classId ? { class: o.classId } : {}), ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const all: (Edge & { key: Here; coordinator?: boolean })[] = [
    { key: "grid", screen: "timetable", href: `/timetable${q()}`, label: "The grid", icon: "week", line: o.fn ? `Fortnight ${o.fn}, week by week` : "week by week" },
    { key: "fortnight", screen: "fortnight", href: o.fn ? `/timetable/fortnight/${o.fn}${q({ fn: undefined })}` : "/timetable", label: o.fn ? `Fortnight ${o.fn}` : "Fortnights", icon: "fortnight", line: "freeze, move, approve" },
    { key: "draft", screen: "draft", href: `/timetable/draft${q({ class: undefined })}`, label: "Draft from the rules", icon: "from-draft", line: "place a fortnight for a class", coordinator: true },
    { key: "rules", screen: "rules", href: "/timetable/rules", label: "Timetable rules", icon: "checklist", line: "what the draft reads", coordinator: true },
    { key: "materials", screen: "materials", href: "/educator/materials", label: "Materials", icon: "materials", line: "what to lay out" },
  ];
  return all
    .filter((e) => e.key !== here && (o.coordinator || !e.coordinator))
    .map((e): Edge => ({ screen: e.screen, href: e.href, label: e.label, icon: e.icon, line: e.line }));
}

/** The rail of a page of the Timetable door: the door's other pages, then whatever the page adds (`edges` after them, `cards`, `facts`). */
export function TimetableRail({ here, fn, classId, coordinator, edges = [], cards, facts }: { here: Here; fn?: number; classId?: string; coordinator: boolean; edges?: Edge[]; cards?: ReactNode; facts?: ReactNode }) {
  return <Rail edges={[...timetableEdges(here, { fn, classId, coordinator }), ...edges]} cards={cards} facts={facts} />;
}
