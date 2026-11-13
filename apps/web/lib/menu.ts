// The site's menu: the left sidebar, grouped by the educator's jobs (docs/frontend/page-charter.md A1, approved by Nimish on 12 Nov
// 2026). My day, Timetable, Children, Assessments, and School for the coordinator, in that order and no other. Each existing route
// belongs to one section by its `match`, the longest matching prefix winning. Pure, so a test can read it. Nothing here names a subject
// (docs/ux-rules.md rule 6).
//
// What needs doing is gone into Today (Part C: its kinds of work, filters and mark-taught form are Today's "waiting on you"; its address
// answers 308 there). Upload papers is gone into the assessment it belongs to (B6). Time by subject (B3) sits between the Fortnight and
// Materials, as the charter orders the Timetable section.
import type { IconName } from "./icons";

/** `guide: false`: the page has no page of the Guide yet (packages/engine/tests/test_guide.py reads the entries written
 *  `{ href, label, ...`). `coordinator`: only the coordinator's sidebar lists it. `view`: the page is the timetable's view of that name
 *  (`?view=`), so the Week and the Fortnight lines are told apart on the one address. */
export type MenuPage = { href: string; label: string; match: readonly string[]; guide?: false; coordinator?: boolean; view?: string };
export type SectionKey = "today" | "timetable" | "children" | "assessments" | "school";
/** `coordinator`: the whole section is the coordinator's (School). */
export type Section = { key: SectionKey; label: string; icon: IconName; coordinator?: boolean; pages: readonly MenuPage[] };

export const SECTIONS: readonly Section[] = [
  {
    key: "today",
    label: "My day",
    icon: "today",
    pages: [
      { label: "Today", href: "/today", match: ["/today", "/period"] },
      { label: "Notes to confirm", href: "/notes", match: ["/notes"], guide: false },
    ],
  },
  {
    key: "timetable",
    label: "Timetable",
    icon: "week",
    pages: [
      { label: "Week", href: "/timetable", match: ["/timetable"], guide: false },
      { label: "Fortnight", href: "/timetable?view=fortnight", match: ["/timetable/fortnight", "/timetable/draft"], view: "fortnight", guide: false },
      { label: "Time by subject", href: "/timetable/time", match: ["/timetable/time"], guide: false },
      { label: "Materials", href: "/timetable/materials", match: ["/timetable/materials", "/educator/materials"], guide: false },
    ],
  },
  {
    key: "children",
    label: "Children",
    icon: "child",
    pages: [
      { label: "Class picture", href: "/children", match: ["/children", "/growth"], guide: false },
      { href: "/children/reports", label: "Parent reports", match: ["/children/reports"] },
    ],
  },
  {
    key: "assessments",
    label: "Assessments",
    icon: "assessment",
    pages: [
      { href: "/children/assessments", label: "Assessments", match: ["/children/assessments", "/make", "/worksheets/CS"] },
      { href: "/setup/question-bank", label: "Question bank", match: ["/setup/question-bank", "/library", "/worksheets/taxonomy"] },
    ],
  },
  {
    key: "school",
    label: "School",
    icon: "setup",
    pages: [
      { href: "/across", label: "Across classes", match: ["/across"] },
      { href: "/setup/curriculum", label: "Curriculum", match: ["/setup/curriculum", "/", "/skill-sets", "/worksheets", "/setup"] },
      { label: "Skills to approve", href: "/setup/skills/approve", match: ["/setup/skills"], guide: false },
      { href: "/setup/staff", label: "Staff", match: ["/setup/staff"] },
      { href: "/setup/classes", label: "Classes", match: ["/setup/classes"] },
      { href: "/timetable/rules", label: "Timetable rules", match: ["/timetable/rules"] },
      { label: "How it works", href: "/setup/how-it-works", match: ["/setup/how-it-works"], guide: false },
    ],
  },
];

/** The cookie that keeps the sidebar folded to its icons ("icons") or open, so the next page is drawn the same way by the server. */
export const FOLD_COOKIE = "cs.menu";

const reach = (path: string, m: string) => (m === "/" ? (path === "/" ? 1 : -1) : path === m || path.startsWith(`${m}/`) || (m === "/worksheets/CS" && path.startsWith(m)) ? m.length : -1);

/** The section and page an address belongs to: the longest matching prefix, so /children/assessments is Assessments, not Children.
 *  On the one timetable address, `?view=fortnight` is the Fortnight line and any other view the Week. */
export function locate(address: string): { section: Section; page: MenuPage } | undefined {
  const [path, query = ""] = address.split("#")[0].split("?");
  const view = new URLSearchParams(query).get("view") ?? undefined;
  let best: { section: Section; page: MenuPage; at: number } | undefined;
  for (const section of SECTIONS)
    for (const page of section.pages) {
      let at = Math.max(-1, ...page.match.map((m) => reach(path, m)));
      // the timetable's own address: its view decides between the Week and the Fortnight
      if (path === "/timetable" && page.view) at = view === page.view ? path.length + 1 : -1;
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
