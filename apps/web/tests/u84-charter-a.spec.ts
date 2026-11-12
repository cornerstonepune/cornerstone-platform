/**
 * U84 — the page charter's Part A, the shared frame (docs/frontend/page-charter.md, approved by Nimish on 12 Nov 2026). The sidebar (A1) is
 * held by u13-frame (tests 2, 2b and 6), u53-the-menu and u75-setup-nav; this file holds the detail panel (A2) on its first page, the
 * timetable's week, and the shared blocks of A3 and A4: stat tiles of whole counts, the one state scale, at most two chips on a card, the
 * subject colours, and the one-row filter bar. The class "U74" and its fortnight are the timetable's own test rows (tests/timetable-rows.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { HERE, timetableRows, type Fixture } from "./timetable-rows";
import { levelState, SCALE } from "../lib/state-scale";

test.describe.configure({ mode: "serial" });
const WEB = path.resolve(__dirname, "..");
const read = (f: string) => readFileSync(path.join(WEB, f), "utf8");
const FILTERS_IN_ROW = Number(/FILTERS_IN_ROW = (\d+)/.exec(read("components/filter-bar.tsx"))![1]);
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
let wasOn = false;
let lesson = "";
let had: string | null = null;

test.beforeAll(async () => {
  f = await timetableRows(sql);
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
  // one lesson of the week shown carries an activity with its four levels, so its panel has a rubric
  const [s] = await sql<{ id: string; activity_code: string | null }[]>`
    select s.id::text as id, s.activity_code from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass} and d.on_date = ${f.days[1]}::date and s.kind <> 'fixed' order by s.period_id limit 1`;
  lesson = s.id;
  had = s.activity_code;
  const [a] = await sql<{ code: string }[]>`select code from activity where band = 'K1' and coalesce(level_1, '') <> '' and coalesce(level_3, '') <> '' order by code limit 1`;
  await sql`update session set activity_code = ${a.code} where id = ${lesson}`;
});
test.afterAll(async () => {
  await sql`update session set activity_code = ${had} where id = ${lesson}`;
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const week = () => `/timetable?fn=${HERE}&class=${f.klass}&view=week&day=${f.days[1]}`;
const block = (page: Page) => page.locator(`[data-open-key="lesson:${lesson}"]`);
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");

test("A2: choosing a lesson block opens its lesson on the right in tabs, and the address carries it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(week());
  // nothing chosen: the summary, stat tiles and never a list of links
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(panel(page).locator("[data-block=StatTile]")).toHaveCount(3);
  await expect(panel(page).getByRole("link")).toHaveCount(0);
  await block(page).click();
  await expect(page).toHaveURL(new RegExp(`[?&]open=lesson(%3A|:)${lesson}`));
  await expect(panel(page)).toHaveAttribute("data-panel", "open");
  await expect(block(page)).toHaveAttribute("aria-expanded", "true");
  // the same tabs as every lesson, in order; Activity first, with the rubric on the one state scale
  await expect(panel(page).getByRole("tab")).toHaveText(["Activity", "Children", "Materials", "History"]);
  await expect(panel(page).getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  const levels = panel(page).locator("[data-block=Rubric] [data-level]");
  await expect(levels).toHaveCount(4);
  await expect(levels.nth(0)).toHaveAttribute("data-state", "quiet");
  await expect(levels.nth(1)).toHaveAttribute("data-state", "wait");
  await expect(levels.nth(2)).toHaveAttribute("data-state", "wait");
  await expect(levels.nth(3)).toHaveAttribute("data-state", "ok");
  // the title takes the focus, and the panel is opened full page at the lesson's own address
  await expect(panel(page).locator("[data-panel-title]")).toBeFocused();
  await expect(panel(page).getByRole("link", { name: "Open full page" })).toHaveAttribute("href", `/period/${lesson}`);
});

test("A2: the coordinator's Move, Edit and Choose activity are in the panel, never inside the blocks", async ({ page }) => {
  await page.goto(`${week()}&open=lesson:${lesson}`);
  const actions = panel(page).locator("[data-panel-actions]");
  await expect(actions.getByRole("link", { name: "Move" })).toHaveAttribute("href", new RegExp(`/timetable/fortnight/${HERE}\\?.*from=`));
  await expect(actions.locator("summary", { hasText: "Edit" })).toBeVisible();
  await expect(actions.locator("summary", { hasText: "Choose activity" })).toBeVisible();
  const grid = page.locator("[data-block=FortnightGrid]");
  await expect(grid.locator("[data-pick], [data-activity-link]")).toHaveCount(0);
  await expect(grid.getByRole("link", { name: /^(Move|Edit|Choose)/ })).toHaveCount(0);
});

test("A2: a link or a reload opens the same lesson and tab; the tabs are a keyboard tab list", async ({ page }) => {
  await page.goto(`${week()}&open=lesson:${lesson}&tab=history`);
  await expect(panel(page).getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("tabpanel")).toHaveCount(1); // the hidden panels are hidden
  const tab = panel(page).getByRole("tab", { name: "History" });
  await tab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(panel(page).getByRole("tab", { name: "Materials" })).toBeFocused();
  await expect(panel(page).getByRole("tab", { name: "Materials" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/tab=materials/);
  await page.keyboard.press("Home");
  await expect(panel(page).getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(panel(page).getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page)).toHaveAttribute("data-open", `lesson:${lesson}`);
});

test("A2: Escape and the × close the panel, the page stays where it was, and the focus goes back to the block", async ({ page }) => {
  await page.goto(week());
  await block(page).click();
  await expect(panel(page)).toHaveAttribute("data-panel", "open");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(page).not.toHaveURL(/open=/);
  await expect(page).toHaveURL(new RegExp(`fn=${HERE}`));
  await expect(block(page)).toBeFocused();
  await block(page).click();
  await panel(page).getByRole("link", { name: "Close the panel" }).click();
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(block(page)).toBeFocused();
});

test("A2: on a phone an open panel is a sheet over the page, and closes the same way", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto(`${week()}&open=lesson:${lesson}`);
  // its box is read once it is drawn open (a box read straight after the load can come before the panel is laid out: null)
  await expect(panel(page)).toHaveAttribute("data-panel", "open");
  await expect(panel(page)).toBeVisible();
  const box = (await panel(page).boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(400);
  await expect(panel(page).getByRole("tab")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("A2: a lesson the person may not see is not opened; an address that is not <kind>:<id> opens nothing", async ({ page }) => {
  for (const open of ["lesson:00000000-0000-0000-0000-000000000000", "nonsense", "lesson:<b>"]) {
    const res = await page.goto(`${week()}&open=${encodeURIComponent(open)}`);
    expect(res?.status(), open).toBe(200);
    await expect(panel(page), open).toHaveAttribute("data-panel", "summary");
  }
});

test("A3: stat tiles show whole counts, one line each, and the panel's summary counts what the grid shows", async ({ page }) => {
  await page.goto(week());
  const tiles = panel(page).locator("[data-block=StatTile]");
  for (const n of await tiles.locator(".b-stat-n").allInnerTexts()) expect(n).toMatch(/^\d[\d,]*$/);
  const lessons = Number((await panel(page).locator('[data-stat="lessons"] .b-stat-n').innerText()).replace(/,/g, ""));
  expect(lessons).toBe(await page.locator("[data-block=FortnightGrid] .b-cell").count());
  expect(read("components/stat-tile.tsx")).toMatch(/Number\.isInteger\(n\)/);
});

test("A3: one state scale: secure green, practising amber, needs help red, not seen grey; rubric levels 0-3 on it", () => {
  expect([...SCALE]).toEqual(["secure", "practising", "needsHelp", "notSeenYet"]);
  expect([0, 1, 2, 3].map((n) => levelState(n, 4))).toEqual(["notSeenYet", "practising", "practising", "secure"]);
  expect(() => levelState(4, 4)).toThrow();
  expect(() => levelState(1.5, 4)).toThrow();
  // no page types a level's words: the rubric shows the activity's own
  expect(read("components/lesson-panel.tsx")).not.toMatch(/"(Emerging|Developing|Secure|Mastered|Beginning)"/);
});

test("A3: a card holds at most two chips, one status and one count, and no other way to add one", () => {
  const cards = read("components/cards.tsx");
  expect(cards).toMatch(/status\?: \{ state: State; words\?: string \}; count\?: \{ n: number; words: string \}/);
  expect(cards.match(/<StatusChip/g)?.length).toBe(1);
  expect(cards).toContain("CARD_CHIPS_MAX = 2");
});

test("A3: subject colours come from the subject rows and any block can wear them", () => {
  const looks = read("lib/subject-looks.ts");
  expect(looks).toContain("timetable.subject_looks");
  expect(read("lib/timetable-ui.ts")).toContain('from "./subject-looks"');
  expect(read("components/subject-tag.tsx")).toMatch(/data-subject=\{look\}/);
});

test("A4: the filter row shows its first dropdowns and puts the rest behind More filters, which says how many are on", async ({ page }) => {
  await page.goto("/setup/blocks?open=FilterBar&kind=child");
  const bar = page.locator('[data-sample="FilterBar"] [data-filterbar]');
  await expect(bar.locator("form > label select")).toHaveCount(FILTERS_IN_ROW);
  const more = bar.locator("details[data-more-filters]");
  await expect(more.locator("summary")).toHaveText("More filters (1 on)");
  // a filter of its own is on, so it stands open, its dropdown in reach; closed, it hides the rest
  await expect(more).toHaveAttribute("open", "");
  await expect(more.getByRole("combobox")).toHaveCount(1);
  await more.locator("summary").click();
  await expect(more.getByRole("combobox")).toHaveCount(0);
  // at 1440 the row is one line
  const tops = await bar.locator("form > label, form > details").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});
