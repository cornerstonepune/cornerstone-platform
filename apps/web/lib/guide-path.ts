import data from "../design-system/help.json";

// Where the help explains a page of the site (UI-12): each screen of docs/frontend/screens.json has one section on /guide,
// whose address is the screen's id. Pure, so the "?" in the bar can use it in the browser.
type Section = { id: string; route: string };
const SECTIONS = data.sections as Section[];

const pattern = (route: string) => new RegExp(`^${route.split("/").map((p) => (p.startsWith("[") ? "[^/]+" : p.replace(/[.*+?^${}()|\\]/g, "\\$&"))).join("/")}$`);
// the screen whose route has the fewest [params] wins ("/children/assessments" is Assessments, not a class), the first of equals
const params = (route: string) => route.split("/").filter((p) => p.startsWith("[")).length;
const MATCHERS = SECTIONS.map((s) => ({ id: s.id, re: pattern(s.route), params: params(s.route) })).sort((a, b) => a.params - b.params);

/** The help section of the screen a path belongs to (the first screen of that route), or none: a page not in the inventory has no section. */
export function sectionFor(path: string): string | undefined {
  return MATCHERS.find((m) => m.re.test(path.split("?")[0].split("#")[0]))?.id;
}

/** The address "?" opens from a page: the help at that page's section, or its front when the page has none. */
export function guideFor(path: string): string {
  const id = path.startsWith("/guide") ? undefined : sectionFor(path);
  return id ? `/guide#${id}` : "/guide";
}
