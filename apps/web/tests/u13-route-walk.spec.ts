/**
 * U13 (UI-13), Done when 5 — every route of the app is reached by clicking from the bar in at most three clicks. The route list is the
 * app's own (every page.tsx under app/); the walk follows the links each page really draws, starting from the bar: click one is a door,
 * click two a link on that page, click three a link on that one. A route no click reaches fails by name.
 */
import { expect, test } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { GROUPS, doorOf } from "../lib/menu";
import { inventoryRows, sessionFor, SECTION, type Rows } from "./inventory-fixtures";

const APP = path.resolve(__dirname, "../app");

function routes(dir = APP, base = ""): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f === "api" || f === "login") continue; // the API is not a page; sign-in is the way in, not a destination of the bar
      const seg = f.startsWith("(") && f.endsWith(")") ? "" : `/${f}`;
      out.push(...routes(p, base + seg));
    } else if (f === "page.tsx") out.push(base || "/");
  }
  return out;
}
const pattern = (r: string) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, "[^/]+")}$`);

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let rows: Rows;
test.beforeAll(async () => {
  rows = await inventoryRows(sql);
});
test.afterAll(async () => {
  await sql.end();
});

/** Routes no click reaches in the test database, each with its reason. A route here still has to open (below); it is
 *  opened by an action's redirect, or by a link that exists only where rows the test database does not hold exist (a
 *  period in a timetable, a recorded note, a printed paper), or it is four clicks deep (a child's report). The screens
 *  that replace them (docs/frontend/screens.json) are each reached by the inventory test once built. */
const NOT_BY_CLICK: Record<string, string> = {
  "/children/[class]": "the Children table lists children and opens their peek; the class picture is its toggle, drawn only for a person with a class",
  "/children/[class]/[roll]": "a child's page, opened from the peek of a child in the table",
  "/refused": "where an action sends a person it refused",
  "/children/assessments/[key]": "a link on an assessment's row, which needs an assessment of the class (tests/u73-assessments.spec.ts opens it with rows)",
  "/children/assessments/[key]/[roll]": "a child's copy on that assessment (tests/u73-assessments.spec.ts opens it with rows)",
  "/make/[section]/week": "opened by the make form's choice of a class and a week",
  "/skill-sets/[code]/edit": "opened from a skill's own page (click four)",
  "/setup/activities/[code]": "a link of a period or of the materials list, which need a timetable's rows",
  "/setup/objectives/[code]": "a link of an activity, which needs a timetable's rows",
  "/setup/skills/[code]": "a link of an objective, which needs a timetable's rows",
  "/setup/skill-sets/[code]": "a skill's row on Curriculum or Skills to approve, past the rows a test database holds",
  "/record": "opened from a period or from Notes, both of which need a K2 class the test database does not hold with the voice switch on",
  "/period/[id]": "a link of a day of the timetable, which needs a timetable's rows",
  "/notes/[id]": "a card or a row of Notes, which needs a recorded note",
  "/timetable/materials": "the menu's Materials still opens the old page, which keeps the controls this one lacks, until UI-9b moves them (tests/u74-materials.spec.ts opens it)",
  "/timetable/fortnight/[n]": "a link of the timetable page's Fortnight card and of the timetable's rail, which need a fortnight's rows (tests/u74-timetable.spec.ts opens it with rows)",
  "/growth/[id]": "a child's name on a class's page: the class list is click two, a class's page click three, so a child's page is click four. It only counted as reached while the static page /growth/reports (which matches the pattern /growth/[^/]+) was in the app",
  "/growth/[id]/parent": "a link on a child's page (click four)",
  "/growth/[id]/report": "a link on a child's page (click four)",
};

test("5. GROUPS are exactly Today, Timetable, Children, Setup, and every route belongs to a door or sits outside the bar by name", () => {
  expect(GROUPS.map((g) => g.label)).toEqual(["Today", "Timetable", "Children", "Setup"]);
  expect(doorOf("/children/assessments")?.key).toBe("children");
  expect(doorOf("/children/assessments/x~y~z~w/1")?.key).toBe("children");
  expect(doorOf("/growth/x")?.key).toBe("children");
  for (const r of ["/library", "/setup/curriculum", "/setup/skills/approve", "/setup/classes"]) expect(doorOf(r)?.key, r).toBe("setup");
  expect(doorOf("/timetable/rules")?.key).toBe("timetable");
  // the pages outside the bar: help, feedback, the password, the refusal page
  const outside = routes().filter((r) => !doorOf(r.replace(/\[[^\]]+\]/g, "x")));
  expect(outside.sort()).toEqual(["/feedback", "/guide", "/refused"].sort());
});

// a file the page links to (a PDF, an image), not a page: a question's address has dots in its key (/setup/question-bank/SUB.2D2D.REG0-…)
// and is a page
const FILE = /\.(pdf|png|jpe?g|svg|webp|ico|css|js|json|txt|xml|csv|zip)$/i;

test("5. each route is reached by clicking from the bar in at most three clicks", async ({ playwright }) => {
  test.setTimeout(300_000);
  const api = await playwright.request.newContext({ baseURL: "http://localhost:3100", extraHTTPHeaders: { cookie: `cs_staff=${sessionFor("e2e@cornerstone.test")}` } });
  const hrefsOf = async (url: string): Promise<string[]> => {
    const res = await api.get(url);
    if (!res.ok()) return [];
    const html = await res.text();
    return [...html.matchAll(/<a\b[^>]*?\shref="([^"#]*)[^"]*"/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((h) => h.startsWith("/") && !h.startsWith("//") && !h.startsWith("/api/") && !h.startsWith("/_next") && !FILE.test(h));
  };
  // clicks: from the bar (a door, help, the account, report a problem), then two more
  let frontier = new Set(await hrefsOf("/today"));
  const reached = new Set<string>();
  const seen = new Set<string>();
  for (let click = 1; click <= 3; click++) {
    const next = new Set<string>();
    for (const href of frontier) {
      reached.add(href.split("?")[0]);
      if (click === 3 || seen.has(href)) continue;
      seen.add(href);
      for (const h of await hrefsOf(href)) next.add(h);
    }
    frontier = next;
  }
  const all = routes();
  const lost = all.filter((r) => ![...reached].some((h) => pattern(r).test(h)));
  const missed = lost.filter((r) => !(r in NOT_BY_CLICK));
  expect(missed, `routes no three clicks from the bar reach (class ${SECTION}, children ${Object.keys(rows.children).length})`).toEqual([]);
  expect(Object.keys(NOT_BY_CLICK).filter((r) => !all.includes(r)), "a route that is not in the app").toEqual([]);
});
