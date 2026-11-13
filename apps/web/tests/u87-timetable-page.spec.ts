/**
 * U87 — the Timetable as the page charter's B2 draws it (docs/frontend/page-charter.md, B2): one test per line of B2. The grid of the
 * week shown on the left, every block opening its lesson in the detail panel on the right (the lesson panel the lesson page shares), the
 * coordinator's Move, Edit and Choose activity in that panel and never in a block, and with nothing chosen the week's numbers: lessons,
 * each subject's share, moved by hand, clashes. No table of lessons by subject. Stands on the U74 class and its fortnight
 * (tests/timetable-rows.ts); its educator is named from tests/fake-names.ts.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import { HERE, timetableRows, type Fixture } from "./timetable-rows";
import { wholePercents } from "../lib/whole-percents";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u87-educator@cornerstone.test", name: FAKE_STAFF[3], role: "educator", classes: [], subjects: [] };
let f: Fixture;
let wasOn = false;
// week A (the first five school days of the fortnight) and week B
const weekA = () => f.days.slice(0, 5);
const weekB = () => f.days.slice(5, 10);
const week = (day = f.days[1]) => `/timetable?fn=${HERE}&class=${f.klass}&view=week&day=${day}`;
const grid = (page: Page) => page.locator("[data-block=FortnightGrid]");
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");

test.beforeAll(async () => {
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${f.tenant}, ps.staff_id, 'cover_educator', ${f.klass}, current_date - 3, 'u87 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${f.klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const educatorPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

/** The class's lessons on these days, as the rows hold them: each with its subject's label. */
const lessonsOn = (days: string[]) => sql<{ id: string; code: string; label: string; state: string }[]>`
  select s.id::text as id, s.subject_code as code, coalesce(su.label, su.name, s.subject_code) as label, s.state
  from session s join school_day d on d.id = s.school_day_id left join subject su on su.code = s.subject_code and su.tenant_id = s.tenant_id
  where s.school_class_id = ${f.klass} and d.on_date = any(${days}::date[]) and s.kind <> 'fixed'`;

test("B2 job: every lesson the class has in the week shown is a block, and every block opens its own lesson", async ({ page }) => {
  await page.goto(week());
  const rows = await lessonsOn(weekA());
  expect(rows.length).toBeGreaterThan(0);
  const blocks = grid(page).locator(".b-cell");
  await expect(blocks).toHaveCount(rows.length);
  const keys = await grid(page).locator("a.b-cell[data-open-key]").evaluateAll((as) => as.map((a) => a.getAttribute("data-open-key")));
  expect(keys.sort()).toEqual(rows.map((r) => `lesson:${r.id}`).sort());
});

test("B2 primary action: Open today, under the title, opens today in the Day view", async ({ page }) => {
  await page.goto(week());
  const action = page.locator("[data-ux=action]").getByRole("link", { name: "Open today" });
  await expect(action).toBeVisible();
  const [{ today }] = await sql<{ today: string }[]>`select (now() at time zone 'Asia/Kolkata')::date::text as today`;
  await action.click();
  await expect(page).toHaveURL(/view=day/);
  await expect(page).toHaveURL(new RegExp(`day=${today}`));
  await expect(page.locator("[data-view=day], [data-no-fortnight-today], [data-block=EmptyState]").first()).toBeVisible();
});

test("B2 left: the grid has days across and periods down, subject-coloured blocks, and each period's time printed once", async ({ page }) => {
  await page.goto(week());
  await expect(grid(page).locator(".b-dh")).toHaveCount(5); // the five days of the week shown, across
  const times = await grid(page).locator(".b-tm").allInnerTexts();
  expect(times.length).toBe(f.periods.length); // a row for each period, down
  expect(new Set(times).size).toBe(times.length); // each time once
  const [{ looks }] = await sql<{ looks: Record<string, string> | null }[]>`select (select value from config where key = 'timetable.subject_looks') as looks`;
  for (const p of f.periods) {
    const look = looks?.[p.subject] ?? "arts";
    const [row] = await sql<{ id: string }[]>`
      select s.id::text as id from session s join school_day d on d.id = s.school_day_id
      where s.school_class_id = ${f.klass} and d.on_date = ${f.days[0]}::date and s.period_id = ${p.id}`;
    await expect(grid(page).locator(`[data-open-key="lesson:${row.id}"]`)).toHaveAttribute("data-subject", look);
  }
});

test("B2 right, a block chosen: the lesson panel the lesson page shares, with its four tabs and its full page", async ({ page }) => {
  await page.goto(week());
  const first = grid(page).locator("a.b-cell[data-open-key]").first();
  const key = (await first.getAttribute("data-open-key"))!;
  await first.click();
  await expect(panel(page)).toHaveAttribute("data-panel", "open");
  await expect(panel(page)).toHaveAttribute("data-open", key);
  await expect(panel(page).getByRole("tab")).toHaveText(["Activity", "Children", "Materials", "History"]);
  await expect(panel(page).getByRole("link", { name: "Open full page" })).toHaveAttribute("href", `/period/${key.slice("lesson:".length)}`);
});

test("B2 right, a block chosen: the coordinator's Move, Edit and Choose activity are in the panel; an educator has none; no block holds a button", async ({ page, browser }) => {
  const [lesson] = await lessonsOn([f.days[1]]);
  await page.goto(`${week()}&open=lesson:${lesson.id}`);
  const actions = panel(page).locator("[data-panel-actions]");
  await expect(actions.getByRole("link", { name: "Move" })).toBeVisible();
  await expect(actions.locator("summary", { hasText: "Edit" })).toBeVisible();
  await expect(actions.locator("summary", { hasText: "Choose activity" })).toBeVisible();
  // a block is one link and nothing inside it can be pressed
  await expect(grid(page).locator(".b-cell button, .b-cell a, .b-cell summary, .b-cell [role=button], [data-pick], [data-activity-link]")).toHaveCount(0);
  const edu = await educatorPage(browser);
  try {
    await edu.goto(`${week()}&open=lesson:${lesson.id}`);
    await expect(panel(edu)).toHaveAttribute("data-panel", "open");
    await expect(panel(edu).locator("[data-panel-actions]").getByRole("link", { name: "Move" })).toHaveCount(0);
    await expect(panel(edu).locator("[data-panel-actions] summary")).toHaveCount(0);
    await expect(grid(edu).locator(".b-cell button, .b-cell a, .b-cell summary")).toHaveCount(0);
  } finally {
    await edu.context().close();
  }
});

/** What the panel's summary must say for these days: the lessons, each subject's whole share, the moved, and the clashes not accepted. */
async function expected(days: string[]) {
  const rows = await lessonsOn(days);
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.label, (by.get(r.label) ?? 0) + 1);
  const parts = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pc = wholePercents(parts.map(([, n]) => n));
  const [{ clashes }] = await sql<{ clashes: number }[]>`
    select count(*)::int as clashes from timetable_clash c
    where c.fortnight_id = ${f.here} and not c.accepted
      and exists (select 1 from jsonb_array_elements(to_jsonb(c.places)) p where p->>'class' = ${f.klass} and p->>'date' = any(${days}::text[]))`;
  return { lessons: rows.length, moved: rows.filter((r) => r.state === "moved").length, clashes, shares: parts.map(([label], i) => ({ label, pc: pc[i] })) };
}
const tile = async (page: Page, id: string) => Number((await panel(page).locator(`[data-stat="${id}"] .b-stat-n`).innerText()).replace(/,/g, ""));

test("B2 right, nothing chosen: stat tiles for the week shown: lessons, % by subject, moved, clashes; and they follow the week", async ({ page }) => {
  for (const [days, day] of [[weekA(), f.days[1]], [weekB(), f.days[6]]] as const) {
    const want = await expected([...days]);
    await page.goto(week(day));
    await expect(panel(page)).toHaveAttribute("data-panel", "summary");
    await expect(panel(page).getByRole("heading", { name: "This week" })).toBeVisible();
    expect(await tile(page, "lessons")).toBe(want.lessons);
    expect(await tile(page, "moved")).toBe(want.moved);
    expect(await tile(page, "clashes")).toBe(want.clashes);
    // the mini bar: each subject of the week by its name, its whole percent; together 100
    const mix = panel(page).locator("[data-block=SubjectMix]");
    await expect(mix.locator(".b-sbar i")).toHaveCount(want.shares.length);
    for (const s of want.shares) await expect(mix.locator(`[data-subject-share="${s.label}"]`)).toContainText(`${s.pc}%`);
    expect(want.shares.reduce((t, s) => t + s.pc, 0)).toBe(100);
  }
  // the fixture's hand move is in week A, so the two weeks differ and the tiles are the week's, not the fortnight's
  expect((await expected(weekA())).moved).toBeGreaterThan(0);
  expect((await expected(weekB())).moved).toBe(0);
});

test("B2: the lessons-by-subject table is not on this page (it is Time by subject, B3)", async ({ page }) => {
  await page.goto(week());
  await expect(grid(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: /lessons by subject/i, level: 2 })).toHaveCount(0);
  await expect(page.locator("main table, [data-subject-row]")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Lessons by subject" })).toHaveCount(0);
});
