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
      { href: "/today", label: "What needs doing", match: ["/today", "/voice"] },
      { label: "Your day", href: "/educator", match: ["/educator"], guide: false },
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
      { label: "Materials", href: "/educator/materials", match: ["/educator/materials"], guide: false },
      { href: "/timetable/rules", label: "Timetable rules", match: ["/timetable"] },
    ],
  },
  {
    key: "children",
    label: "Children",
    href: "/k2",
    icon: "child",
    screen: "children",
    pages: [
      { label: "Children", href: "/k2", match: ["/k2"], guide: false },
      { href: "/papers", label: "Assessments", match: ["/papers", "/children/assessments", "/make", "/home", "/worksheets/CS"] },
      { href: "/papers/approve", label: "Papers to approve", match: ["/papers/approve"] },
      { href: "/capture", label: "Upload papers", match: ["/capture"] },
      { href: "/capture/check", label: "Check answers", match: ["/capture/check"] },
      { href: "/growth", label: "Class results", match: ["/growth"] },
      { href: "/growth/reports", label: "Parent reports", match: ["/growth/reports"] },
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
      { label: "Curriculum, one list", href: "/setup/curriculum", match: ["/setup/curriculum"], guide: false },
      { label: "Skills to approve, one list", href: "/setup/skills/approve", match: ["/setup/skills"], guide: false },
      { label: "Question bank, new", href: "/setup/question-bank", match: ["/setup/question-bank"], guide: false },
      { label: "Browse the curriculum", href: "/curriculum/browse", match: ["/curriculum/browse"], guide: false },
      { label: "What is filled", href: "/curriculum/fill", match: ["/curriculum/fill"], guide: false },
      { label: "Check the drafted parts", href: "/curriculum/fill/walk", match: ["/curriculum/fill/walk"], guide: false },
      { label: "Skills offered", href: "/curriculum/offers", match: ["/curriculum/offers"], guide: false },
      { href: "/skill-sets/approve", label: "Skills to approve", match: ["/skill-sets/approve"] },
      { href: "/library", label: "Question bank", match: ["/library", "/worksheets/taxonomy"] },
      { href: "/staff", label: "Staff", match: ["/staff"] },
      { href: "/school", label: "School", match: ["/school"] },
      { label: "How it works", href: "/workflows", match: ["/workflows"], guide: false },
    ],
  },
];

const reach = (path: string, m: string) => (m === "/" ? (path === "/" ? 1 : -1) : path === m || path.startsWith(`${m}/`) || (m === "/worksheets/CS" && path.startsWith(m)) ? m.length : -1);

/** The page and door a path belongs to: the longest matching prefix, so /papers/approve is its own page of Children. */
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
