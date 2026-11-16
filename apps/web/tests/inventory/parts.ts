// The inventory test is split into one spec file for each part of the site (CP: the browser shards, 16 Nov 2026). A spec file stays whole
// on one runner, and the one file that drove every screen took 25 minutes and hit the shard's limit; each part is a real responsibility of
// the site, so a part's file is the screens of that part and nothing else. `partOf` says where a screen goes; the report test in
// u70-inventory.spec.ts fails for a screen that belongs to no part, or to a part with no file, so a screen cannot be left out unseen.
import type { Screen } from "./load";

export const PARTS = ["today", "timetable", "children", "curriculum", "question-bank", "school", "outside"] as const;
export type Part = (typeof PARTS)[number];

/** The part of the site a screen belongs to; none for a screen in a group the parts do not name. */
export function partOf(s: Pick<Screen, "group" | "route">): Part | null {
  switch (s.group) {
    case "Today":
      return "today";
    case "Timetable":
      return "timetable";
    case "Children":
      return "children";
    case "Outside the bar":
      return "outside";
    case "Setup":
      if (s.route.startsWith("/setup/question-bank")) return "question-bank";
      if (s.route === "/setup/curriculum" || s.route === "/setup/skills/approve") return "curriculum";
      return "school";
    default:
      return null;
  }
}

/** The spec file of a part. */
export const fileOf = (p: Part) => `u70-inventory-${p}.spec.ts`;
