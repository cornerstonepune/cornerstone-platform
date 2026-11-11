// The site's menu: four doors and the pages inside each (docs/frontend/screens.json `groups`, UI-13). Today, Timetable,
// Children, Setup, in that order and no other. Each existing route belongs to one door by the `group` of the screen that
// is its successor in screens.json; assessments, papers, capture and growth are Children. A door's pages are the second
// row of the bar, so a page of the old side menus is at most two clicks from any page. Pure, so a test can read it.
// Nothing here names a subject (docs/ux-rules.md rule 6).
import type { IconName } from "./icons";

/** `guide: false`: the page has no page of the Guide yet (the Guide has one page per menu item that existed before the four doors;
 *  packages/engine/tests/test_guide.py reads those from entries written `{ href, label, ...`). Its "?" opens the Guide's front. */
export type MenuPage = { href: string; label: string; match: readonly string[]; guide?: false };
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
      { href: "/today", label: "What needs doing", match: ["/today", "/record", "/period"] },
      // the K2 voice notes (UI-3a): the old addresses are gone, so Notes has its own door; its page is a 404 while voice notes are off
      { label: "Notes", href: "/notes", match: ["/notes"], guide: false },
      { label: "Your day", href: "/educator", match: ["/educator"], guide: false },
      { label: "Today, new look", href: "/today/new", match: ["/today/new"], guide: false },
    ],
  },
  {
    key: "timetable",
    label: "Timetable",
    href: "/educator/week",
    icon: "week",
    screen: "timetable",
    pages: [
      { label: "This week", href: "/educator/week", match: ["/educator/week"], guide: false },
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
      { label: "Children", href: "/children", match: ["/children", "/k2"], guide: false },
      { href: "/children/assessments", label: "Assessments", match: ["/children/assessments", "/make", "/home", "/worksheets/CS"] },
      { href: "/capture", label: "Upload papers", match: ["/capture"] },
      { href: "/growth", label: "Class results", match: ["/growth"] },
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
      { href: "/", label: "Curriculum", match: ["/", "/curriculum", "/skill-sets", "/worksheets", "/asks", "/educator/activity", "/setup"] },
      // the new screens (UI-11), beside the old pages until those are retired one at a time (UI-11b); then these take the old names
      { label: "All the curriculum", href: "/setup/curriculum", match: ["/setup/curriculum"], guide: false },
      { label: "Approve skills one by one", href: "/setup/skills/approve", match: ["/setup/skills"], guide: false },
      { label: "Bank of questions", href: "/setup/question-bank", match: ["/setup/question-bank"], guide: false },
      { label: "Browse the curriculum", href: "/curriculum/browse", match: ["/curriculum/browse"], guide: false },
      { label: "What is filled", href: "/curriculum/fill", match: ["/curriculum/fill"], guide: false },
      { label: "Check the drafted parts", href: "/curriculum/fill/walk", match: ["/curriculum/fill/walk"], guide: false },
      { label: "Skills offered", href: "/curriculum/offers", match: ["/curriculum/offers"], guide: false },
      { href: "/skill-sets/approve", label: "Skills to approve", match: ["/skill-sets/approve"] },
      { href: "/library", label: "Question bank", match: ["/library", "/worksheets/taxonomy"] },
      { href: "/staff", label: "Staff", match: ["/staff", "/setup/staff"] },
      { href: "/setup/classes", label: "School", match: ["/setup/classes", "/school"] },
      { label: "How it works", href: "/workflows", match: ["/workflows"], guide: false },
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
