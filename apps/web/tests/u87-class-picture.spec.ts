/**
 * U87 — the class picture as the page charter's B5 draws it (docs/frontend/page-charter.md §B5, and Part C's "A child: becomes B5's panel
 * opened full page"). One test per line of the charter, in its order: the skill chooser as the primary action; the four stat tiles; the class
 * as a grid of child cards coloured by state; the child panel and its tabs; the child's page as that panel full page; and names only for the
 * classes the person may see. The class is the spec's own (section U87, used by no other spec), its children from tests/fake-names.ts, and
 * its states are the graph's rows written here, so every count is known: on the first skill one child secure, one practising, one needing
 * help (a red-coloured state), one with too few answers yet and four with no row at all.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { asEducator } from "./children-world";
import { aClass } from "./rows";
import { voiceSwitch } from "./k2-rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U87";
const NAMES = FAKE_CHILDREN.slice(0, 8) as readonly string[];
const first = (i: number) => NAMES[i].split(" ")[0];
let klass = "";
let skills: { code: string; name: string }[] = [];

// Sr. No. → [state code on the first skill, on the second]; null: no row
const STATES: Record<string, [string | null, string | null]> = {
  "1": ["secure", "secure"],
  "2": ["practising", null],
  "3": ["emerging", "secure"],
  "5": ["not_enough_yet", null],
  "6": [null, "practising"],
};

test.beforeAll(async () => {
  await voiceSwitch(sql, true);
  const kids = await aClass(sql, SECTION, "G1", [...NAMES]);
  [{ id: klass }] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  skills = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${tenant} order by name, code limit 2`;
  const ids = Object.values(kids);
  await sql`delete from child_skill_state where child_id = any(${ids}::uuid[])`;
  for (const [roll, pair] of Object.entries(STATES))
    for (const [i, state] of pair.entries())
      if (state)
        await sql`insert into child_skill_state (tenant_id, child_id, skill_code, rung_code, state, n_events, n_correct, last_seen, kind)
                  values (${tenant}, ${kids[NAMES[Number(roll) - 1]]}, ${skills[i].code}, 'R1', ${state}, 5, 3, now() - interval '2 days', 'written')`;
});
test.afterAll(async () => {
  await sql.end();
});

const picture = (q = "") => `/children/${klass}${q}`;
const cards = (page: Page) => page.locator("main [data-block=ClassGrid] .b-sq");
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");

test("B5 primary action: the skill chooser, All skills or one skill, leads the page and the address carries it", async ({ page }) => {
  await page.goto(picture());
  const chooser = page.locator("[data-ux=action] select[name=skill]");
  await expect(chooser).toBeVisible();
  const options = await chooser.locator("option").allInnerTexts();
  expect(options[0]).toBe("All skills");
  for (const s of skills) expect(options.some((o) => o.startsWith(s.name))).toBe(true);
  await expect(page.locator("main h2").first()).toHaveText("The class on every skill");
  await chooser.selectOption(skills[0].code);
  await expect(page).toHaveURL(new RegExp(`skill=${encodeURIComponent(skills[0].code).replace(/\./g, "\\.")}`));
  await expect(page.locator("main h2").first()).toHaveText(`The class on ${skills[0].name}`);
});

test("B5 stat tiles: secure · practising · needs help · not seen, on the one scale, each child counted once and equal to the cards", async ({ page }) => {
  for (const [q, want] of [[`?skill=${skills[0].code}`, [1, 1, 1, 5]], ["", [1, 2, 1, 4]]] as const) {
    await page.goto(picture(q));
    await expect(cards(page)).toHaveCount(NAMES.length); // the page streams in behind its loading screen
    const tiles = panel(page).locator("[data-block=StatTile]");
    await expect(tiles.locator(".b-stat-l")).toHaveText(["secure", "practising", "needs help", "not seen yet"]);
    expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).toEqual(["ok", "wait", "late", "quiet"]);
    const n = (await tiles.locator(".b-stat-n").allInnerTexts()).map(Number);
    expect(n, q || "all skills").toEqual(want);
    expect(n.reduce((a, b) => a + b, 0)).toBe(NAMES.length);
    const byState = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-scale")));
    expect(["secure", "practising", "needsHelp", "notSeenYet"].map((s) => byState.filter((x) => x === s).length)).toEqual(n);
  }
});

test("B5 left: the class as a grid of child cards, Sr. No. and first name in Sr. No. order, coloured by state; never red", async ({ page }) => {
  await page.goto(picture(`?skill=${skills[0].code}`));
  await expect(cards(page)).toHaveCount(NAMES.length);
  expect(await cards(page).locator(".b-no").allInnerTexts()).toEqual(NAMES.map((_, i) => String(i + 1)));
  expect(await cards(page).locator(".b-nm").allInnerTexts()).toEqual(NAMES.map((_, i) => first(i)));
  const looks = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
  // secure green, practising amber, needs help amber with its own mark, too few answers grey, no row dashed: never red
  expect(looks).toEqual(["ok", "wait", "wait", "unseen", "quiet", "unseen", "unseen", "unseen"]);
  await expect(cards(page).nth(2)).toContainText("under half right");
  await expect(cards(page).nth(3)).toContainText("not seen yet");
  await expect(page.locator("main [data-block=ClassGrid] [data-state=late]")).toHaveCount(0);
  await expect(page.locator("main img")).toHaveCount(0);
  const ys = await cards(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
  expect(ys.filter((y) => y === ys[0]).length, "8 to a row at 1440").toBe(8);
});

test("B5 right: a child chosen opens the child panel, tabs Skills · Notes · Papers · Report; Skills is a coloured list; Escape closes it", async ({ page }) => {
  await page.goto(picture(`?skill=${skills[0].code}`));
  const card = cards(page).nth(2);
  await card.click();
  await expect(page).toHaveURL(/open=child%3A3|open=child:3/);
  const open = page.locator("[data-panel=open]");
  await expect(open.locator("[data-panel-title]")).toHaveText(NAMES[2]);
  await expect(open.getByRole("tab")).toHaveText(["Skills", "Notes", "Papers", "Report"]);
  const rows = open.locator("[data-skill-list] li");
  await expect(rows).toHaveCount(2);
  expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-state")).sort())).toEqual(["late", "ok"]);
  await expect(rows.filter({ hasText: skills[0].name }).locator("[data-block=StatusChip]")).toHaveText(/under half right/);
  for (const tab of ["Notes", "Papers", "Report"]) {
    await open.getByRole("tab", { name: tab }).click();
    await expect(open.getByRole("tabpanel")).toBeVisible();
  }
  await expect(page).toHaveURL(/tab=report/);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
  await expect(page.locator('[data-open-key="child:3"]')).toBeFocused();
});

test("A child: the panel opened full page, at /children/[class]/[roll], with the same tabs", async ({ page }) => {
  await page.goto(picture("?open=child:3"));
  await page.locator("[data-panel-full]").click();
  await expect(page).toHaveURL(new RegExp(`/children/${klass}/3$`));
  await expect(page.locator("h1")).toHaveText("Where this child is");
  await expect(page.getByTestId("stage").first()).toContainText(`Sr. No. 3 · ${NAMES[2]}`);
  const full = page.locator("[data-block=DetailPanel]");
  await expect(full.getByRole("tab")).toHaveText(["Skills", "Notes", "Papers", "Report"]);
  await expect(full.locator("[data-panel-close]")).toHaveCount(0);
  await expect(full.locator("[data-block=ChildGraph]")).toBeVisible();
  await page.goto(`/children/${klass}/3?tab=report`);
  await expect(full.getByRole("tab", { name: "Report" })).toHaveAttribute("aria-selected", "true");
  await expect(full.locator("[data-report]")).toBeVisible();
  await page.getByRole("link", { name: "Back to the class" }).click();
  await expect(page.locator("[data-panel=open] [data-panel-title]")).toHaveText(NAMES[2]);
});

test("names only for the classes the person may see: an educator of another class sees no child of this one", async ({ browser, page }) => {
  await page.goto(picture());
  await expect(cards(page).first()).toContainText(first(0));
  const other = await asEducator(browser);
  const p = await other.newPage();
  for (const url of [picture(), picture("?open=child:1"), `/children/${klass}/1`]) {
    await p.goto(url);
    await expect(p.locator("main"), url).not.toContainText(first(0));
    await expect(p.locator("[data-block=ClassGrid], [data-panel=open]"), url).toHaveCount(0);
  }
  await other.close();
});
