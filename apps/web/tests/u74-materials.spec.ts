/**
 * U74 (UI-9) — Materials, this fortnight (/timetable/materials), read only. One test for each Done-when line of
 * specs/UI-9/spec.md. Uses the same Fortnight 10 plan as m1-09-materials.spec.ts: the plan gives Beads no quantity.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { loadFortnight10, materialsFor, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";
import { aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const TUESDAY = "2026-12-01"; // Fortnight 10, week B: tulips today, the dustbin tomorrow, beads on Thursday
const EDUCATOR = { email: "u74-educator@cornerstone.test", name: "U74 Educator", role: "educator", classes: [SECTION] };
const PASSWORD = "u74-a-long-test-password";
let klass = "";
let staff = "";

test.beforeAll(async () => {
  ({ klass, staff } = await k2Class(sql));
  loadFortnight10(SECTION);
  await materialsFor(sql);
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, false);
  await sql.end();
});

const open = (page: Page, q = "span=fortnight") => page.goto(`/timetable/materials?class=${klass}&day=${TUESDAY}&${q}`);
const line = (page: Page, item: string) => page.locator("tr[data-line]").filter({ hasText: item });

async function asEducator(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

test("the screen's purpose: the class's lines built from the plan, each with its activity, and nothing here changes anything", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materials, this fortnight");
  await expect(line(page, "Craft paper")).toContainText("2 sheet");
  await expect(page.getByRole("button", { name: /Save|Remove|Add|Send|WhatsApp/ })).toHaveCount(0);
});

test("1. the day / week / fortnight filter changes the lines shown", async ({ page }) => {
  await open(page, "span=fortnight");
  const fortnight = await page.locator("tr[data-line]").count();
  await open(page, "span=day");
  const day = await page.locator("tr[data-line]").count();
  expect(day).toBeLessThan(fortnight);
});

test("2. a line with no quantity carries the amber 'to confirm' chip, a line with one does not", async ({ page }) => {
  await open(page);
  await expect(line(page, "Beads").locator('[data-chip="toConfirm"]')).toHaveCount(1);
  await expect(line(page, "Craft paper").locator('[data-chip="toConfirm"]')).toHaveCount(0);
});

test("3. each line's activity is a link to the activity", async ({ page }) => {
  await open(page);
  await expect(line(page, "Dustbin").getByRole("link", { name: "Proper Use Of Dustbin" })).toHaveAttribute("href", /ACT-K2-0287/);
});

test("4. the School list tab is the coordinator's: the educator has none and the address says whose it is", async ({ page, browser }) => {
  await open(page);
  await expect(page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "School list" })).toBeVisible();
  const educator = await asEducator(browser);
  await open(educator);
  await expect(educator.getByRole("link", { name: "School list" })).toHaveCount(0);
  await open(educator, "tab=school");
  await expect(educator.getByText("The school's list is the coordinator's.")).toBeVisible();
});

test("5. 'Notes to read' shows only the notes the system could not read", async ({ page }) => {
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from school_class where id = ${klass}`;
  const [{ id: list }] = await sql<{ id: string }[]>`select id from materials_list where school_class_id = ${klass} order by created_at desc limit 1`;
  await sql`insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, reason, staff_id, machine)
    values (${tenant}, gen_random_uuid(), 'materials_note', ${list}, ${sql.json({ text: "Placeholder note: UI-9 lolly sticks" })},
            'needs_person', 'Placeholder: not in the catalogue', ${staff}, 'materials_read')`;
  await open(page, "span=fortnight&show=notes");
  await expect(page.getByText("UI-9 lolly sticks")).toBeVisible();
  await expect(page.locator("tr[data-line]")).toHaveCount(0);
});

test("6. a class that is not hers is not found", async ({ page }) => {
  await page.goto(`/timetable/materials?class=00000000-0000-0000-0000-000000000000&day=${TUESDAY}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("7. the three old materials pages still open", async ({ page }) => {
  for (const p of ["/educator/materials", "/educator/materials/school?month=2026-12", "/educator/materials/review"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
  }
});
