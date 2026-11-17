// The site's menu: the left sidebar, grouped by the educator's jobs (docs/frontend/page-charter.md A1, approved by Nimish on 12 Nov
// 2026). My day, Timetable, Children, Assessments, and School for the coordinator, in that order and no other. Each existing route
// belongs to one section by its `match`, the longest matching prefix winning. Pure, so a test can read it. Nothing here names a subject
// (docs/ux-rules.md rule 6).
//
// What needs doing is gone into Today (Part C: its kinds of work, filters and mark-taught form are Today's "waiting on you"; its address
// answers 308 there). Upload papers is gone into the assessment it belongs to (B6). The timetable is one line, Week, whose own
// Day / Week / Fortnight buttons are its views (Nimish, 16 Nov 2026); Time by subject follows it. Materials left the group on 16 Nov 2026 (Nimish wants it discussed as its own thing); its page
// stays at its address and from a lesson's Materials tab.
import type { IconName } from "./icons";

/** `guide: false`: the page has no page of the Guide yet (packages/engine/tests/test_guide.py reads the entries written
 *  `{ href, label, ...`). `coordinator`: only the coordinator's sidebar lists it. */
export type MenuPage = { href: string; label: string; match: readonly string[]; guide?: false; coordinator?: boolean };
export type SectionKey = "today" | "timetable" | "children" | "assessments" | "curriculum" | "setup";
/** One menu line is one section holding its one page: six lines, no sub-menus (CP-65, Nimish 17 Nov 2026). The other pages of a
 *  section are reached from inside it (Setup lists its four; the Timetable's views are its own buttons). */
export type Section = { key: SectionKey; label: string; icon: IconName; coordinator?: boolean; pages: readonly MenuPage[] };

export const SECTIONS: readonly Section[] = [
  {
    key: "today",
    label: "Today",
    icon: "today",
    pages: [{ href: "/today", label: "Today", match: ["/today", "/period", "/notes"] }],
  },
  {
    key: "timetable",
    label: "Timetable",
    icon: "week",
    pages: [{ label: "Timetable", href: "/timetable", match: ["/timetable"], guide: false }],
  },
  {
    key: "children",
    label: "Children",
    icon: "child",
    pages: [{ label: "Children", href: "/children", match: ["/children", "/growth", "/across"], guide: false }],
  },
  {
    key: "assessments",
    label: "Assessments",
    icon: "assessment",
    pages: [{ href: "/children/assessments", label: "Assessments", match: ["/children/assessments", "/make", "/worksheets/CS", "/setup/question-bank", "/library", "/worksheets/taxonomy"] }],
  },
  {
    key: "curriculum",
    label: "Curriculum",
    icon: "activity",
    pages: [{ href: "/setup/curriculum", label: "Curriculum", match: ["/setup/curriculum", "/setup/skills", "/skill-sets", "/worksheets"] }],
  },
  {
    key: "setup",
    label: "Setup",
    icon: "setup",
    pages: [
      { href: "/setup", label: "Setup", match: ["/setup", "/setup/staff", "/setup/classes", "/timetable/rules", "/setup/how-it-works"] },
    ],
  },
];

/** The cookie that keeps the sidebar folded to its icons ("icons") or open, so the next page is drawn the same way by the server. */
export const FOLD_COOKIE = "cs.menu";

const reach = (path: string, m: string) => (m === "/" ? (path === "/" ? 1 : -1) : path === m || path.startsWith(`${m}/`) || (m === "/worksheets/CS" && path.startsWith(m)) ? m.length : -1);

/** The section and page an address belongs to: the longest matching prefix, so /children/assessments is Assessments, not Children.
 *  The timetable is one line, whatever its view (Day, Week or Fortnight): Nimish, 16 Nov 2026. */
export function locate(address: string): { section: Section; page: MenuPage } | undefined {
  const [path] = address.split("#")[0].split("?");
  let best: { section: Section; page: MenuPage; at: number } | undefined;
  for (const section of SECTIONS)
    for (const page of section.pages) {
      const at = Math.max(-1, ...page.match.map((m) => reach(path, m)));
      if (at > (best?.at ?? -1)) best = { section, page, at };
    }
  return best;
}

/** The section a path belongs to when nothing says the walk began elsewhere; none for the pages outside the menu (help, feedback, password). */
export const sectionOf = (address: string): Section | undefined => locate(address)?.section;

/** The sidebar a person sees: the same for everyone (Nimish, 22 Oct: one set of features for both; 12 Nov: educators see School,
 *  read-only). A coordinator's own buttons stay the coordinator's on the page itself (lib/access.ts says what anyone may change). */
export function sectionsFor(): Section[] {
  return [...SECTIONS];
}
