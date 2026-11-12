// The site's menu: four doors and the pages inside each (docs/frontend/screens.json `groups`, UI-13). Today, Timetable,
// Children, Setup, in that order and no other. Each existing route belongs to one door by the `group` of the screen that
// is its successor in screens.json; assessments, papers, capture and growth are Children. A door's pages are the second
// row of the bar, so a page of the old side menus is at most two clicks from any page. Pure, so a test can read it.
// Nothing here names a subject (docs/ux-rules.md rule 6).
import type { IconName } from "./icons";

/** `guide: false`: the page has no page of the Guide yet (the Guide has one page per menu item that existed before the four doors;
 *  packages/engine/tests/test_guide.py reads those from entries written `{ href, label, ...`). Its "?" opens the Guide's front. */
export type MenuPage = { href: string; label: string; match: readonly string[]; guide?: false; group?: string };
// `group`: a door with many pages (Setup has thirteen) names a heading for each page; the second row then shows the pages in
// labelled clusters that wrap, so no page runs off the edge of the screen. A door whose pages name no group is one row, as before.
export type DoorKey = "today" | "timetable" | "children" | "setup";
/** `screen`: the screen the door opens once its slice has merged (lib/built.ts); until then `href`, the first page below. */
export type Door = { key: DoorKey; label: string; href: string; icon: IconName; screen: string; setup?: boolean; pages: readonly MenuPage[] };

export const GROUPS: readonly Door[] = [
  {
    key: "today",
    label: "Today",
    href: "/today",
    icon: "today",
    screen: "today-educator",
    pages: [
      { label: "Today", href: "/today", match: ["/today", "/record", "/period"], guide: false },
      // the K2 voice notes (UI-3a): the old addresses are gone, so Notes has its own door; its page is a 404 while voice notes are off
      { label: "Notes", href: "/notes", match: ["/notes"], guide: false },
    ],
  },
  {
    key: "timetable",
    label: "Timetable",
    href: "/timetable",
    icon: "week",
    screen: "timetable",
    pages: [
      { label: "Materials", href: "/educator/materials", match: ["/educator/materials", "/timetable/materials"], guide: false },
      { label: "Timetable", href: "/timetable", match: ["/timetable"], guide: false },
      { href: "/timetable/rules", label: "Timetable rules", match: ["/timetable/rules"] },
    ],
  },
  {
    key: "children",
    label: "Children",
    href: "/children",
    icon: "child",
    screen: "children",
    pages: [
      { label: "Children", href: "/children", match: ["/children", "/growth"], guide: false },
      { href: "/children/assessments", label: "Assessments", match: ["/children/assessments", "/make", "/worksheets/CS"] },
      { href: "/capture", label: "Upload papers", match: ["/capture"] },
      { href: "/children/reports", label: "Parent reports", match: ["/children/reports"] },
      { href: "/across", label: "Across classes", match: ["/across"] },
    ],
  },
  {
    key: "setup",
    label: "Setup",
    href: "/",
    icon: "setup",
    screen: "setup",
    setup: true,
    pages: [
      // What needs doing moved here from Today (UI-7b): its controls (a topic taught, the groups of tasks) are not on Today's screens
      { href: "/setup/needs-doing", label: "What needs doing", match: ["/setup/needs-doing"], group: "Skills and questions" },
      { href: "/", label: "Curriculum", match: ["/", "/skill-sets", "/worksheets", "/setup"], group: "Curriculum" },
      // the new screens (UI-11), beside the old pages until those are retired one at a time (UI-11b); then these take the old names
      { label: "All the curriculum", href: "/setup/curriculum", match: ["/setup/curriculum"], guide: false, group: "Curriculum" },
      { label: "Skills to approve", href: "/setup/skills/approve", match: ["/setup/skills"], guide: false, group: "Skills and questions" },
      { label: "Bank of questions", href: "/setup/question-bank", match: ["/setup/question-bank"], guide: false, group: "Skills and questions" },
      { href: "/library", label: "Question bank", match: ["/library", "/worksheets/taxonomy"], group: "Skills and questions" },
      { href: "/setup/staff", label: "Staff", match: ["/setup/staff"], group: "The school" },
      { href: "/setup/classes", label: "School", match: ["/setup/classes"], group: "The school" },
      { label: "How it works", href: "/setup/how-it-works", match: ["/setup/how-it-works"], guide: false, group: "The school" },
    ],
  },
];

const reach = (path: string, m: string) => (m === "/" ? (path === "/" ? 1 : -1) : path === m || path.startsWith(`${m}/`) || (m === "/worksheets/CS" && path.startsWith(m)) ? m.length : -1);

/** The page and door a path belongs to: the longest matching prefix, so /children/assessments is its own page of Children. */
export function locate(address: string): { door: Door; page: MenuPage } | undefined {
  const path = address.split(/[?#]/)[0];
  let best: { door: Door; page: MenuPage; at: number } | undefined;
  for (const door of GROUPS)
    for (const page of door.pages) {
      const at = Math.max(-1, ...page.match.map((m) => reach(path, m)));
      if (at > (best?.at ?? -1)) best = { door, page, at };
    }
  return best;
}

/** The door a path belongs to when nothing says the walk began elsewhere; none for the pages outside the bar (help, feedback, password). */
export const doorOf = (path: string): Door | undefined => locate(path)?.door;

/** The pages of a door, as the bar's second row shows them: none when the door is one page. */
export const pagesOf = (door: Door | undefined): readonly MenuPage[] => (door && door.pages.length > 1 ? door.pages : []);

// The left sidebar (docs/frontend/page-charter.md A1): the teacher's jobs, in five sections, always at the left. It replaces the four
// doors along the bar and the "… pages" fold. A page the charter moves or merges keeps its address here; the doors above stay the map
// for the trail, the walk and the guide. `door`: the door a link belongs to (the trail's first level). `fn`: the address names the
// fortnight in view, which the frame fills in. Nothing here names a subject (docs/ux-rules.md rule 6).
export type SideItem = { label: string; href: string; icon: IconName; match: readonly string[]; door: DoorKey; fortnight?: boolean };
export type SideSection = { key: string; label: string; coordinator?: boolean; items: readonly SideItem[] };

export const SIDEBAR: readonly SideSection[] = [
  {
    key: "my-day",
    label: "My day",
    items: [
      { label: "Today", href: "/today", icon: "today", match: ["/today", "/record", "/period"], door: "today" },
      { label: "Notes to confirm", href: "/notes", icon: "note", match: ["/notes"], door: "today" },
    ],
  },
  {
    key: "timetable",
    label: "Timetable",
    items: [
      { label: "Week", href: "/timetable", icon: "week", match: ["/timetable"], door: "timetable" },
      { label: "Fortnight", href: "/timetable?view=fortnight", icon: "fortnight", match: ["/timetable/fortnight", "/timetable/draft"], door: "timetable", fortnight: true },
      { label: "Materials", href: "/educator/materials", icon: "materials", match: ["/educator/materials", "/timetable/materials"], door: "timetable" },
    ],
  },
  {
    key: "children",
    label: "Children",
    items: [
      { label: "Class picture", href: "/children", icon: "class", match: ["/children", "/growth"], door: "children" },
      { label: "Parent reports", href: "/children/reports", icon: "parent", match: ["/children/reports"], door: "children" },
    ],
  },
  {
    key: "assessments",
    label: "Assessments",
    items: [
      { label: "Board", href: "/children/assessments", icon: "board", match: ["/children/assessments", "/make", "/worksheets/CS", "/capture"], door: "children" },
      { label: "Question bank", href: "/setup/question-bank", icon: "assessment", match: ["/setup/question-bank", "/library", "/worksheets/taxonomy"], door: "setup" },
    ],
  },
  {
    key: "school",
    label: "School",
    coordinator: true,
    items: [
      { label: "Across classes", href: "/across", icon: "table", match: ["/across"], door: "children" },
      { label: "Curriculum", href: "/", icon: "tree", match: ["/", "/skill-sets", "/worksheets", "/setup", "/setup/curriculum"], door: "setup" },
      { label: "What needs doing", href: "/setup/needs-doing", icon: "checklist", match: ["/setup/needs-doing"], door: "setup" },
      { label: "Skills to approve", href: "/setup/skills/approve", icon: "skill", match: ["/setup/skills"], door: "setup" },
      { label: "Staff", href: "/setup/staff", icon: "educator", match: ["/setup/staff"], door: "setup" },
      { label: "Classes", href: "/setup/classes", icon: "school-words", match: ["/setup/classes"], door: "setup" },
      { label: "Timetable rules", href: "/timetable/rules", icon: "setup", match: ["/timetable/rules"], door: "timetable" },
      { label: "How it works", href: "/setup/how-it-works", icon: "help", match: ["/setup/how-it-works"], door: "setup" },
    ],
  },
];

/** The sidebar link a path belongs to: the longest matching prefix (so /timetable/rules is Timetable rules, not Week). */
export function sideItemOf(address: string): SideItem | undefined {
  const path = address.split(/[?#]/)[0];
  let best: { item: SideItem; at: number } | undefined;
  for (const s of SIDEBAR)
    for (const item of s.items) {
      const at = Math.max(-1, ...item.match.map((m) => reach(path, m)));
      if (at > (best?.at ?? -1)) best = { item, at };
    }
  return best?.item;
}
