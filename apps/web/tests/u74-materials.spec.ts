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
  const { id } = await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
  // she holds this class, as the K2 class's own teacher does (k2-rows.ts)
  const [{ t }] = await sql<{ t: string }[]>`select tenant_id as t from school_class where id = ${klass}`;
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by, override_reason)
    select ${t}, ${id}, 'class_teacher', ${klass}, current_date - 1, 'u74 test', 'U74 needs an educator who is not the coordinator'
    where not exists (select 1 from staff_role_grant where staff_id = ${id} and school_class_id = ${klass} and valid_to is null)`;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  // a grant is never deleted, only ended (the table refuses a delete)
  await sql`update staff_role_grant set valid_to = valid_from where staff_id = ${staff} and granted_by = 'u74 test' and valid_to is null`;
  await timetableSwitch(sql, false);
  await sql.end();
});

const open = (page: Page, q = "span=fortnight") => page.goto(`/timetable/materials?class=${klass}&day=${TUESDAY}&${q}`);
// a line of the list on the left (page charter C: the lines by day; a line's detail and its changes are in the panel on the right)
const line = (page: Page, item: string) => page.locator("li[data-line]").filter({ hasText: item });

async function asEducator(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

test("the screen's purpose: the class's lines built from the plan, each with its activity; the list changes nothing, a line's changes are in its panel, and nothing is sent", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materials, this fortnight");
  await expect(line(page, "Craft paper")).toContainText("2 sheet");
  await expect(page.locator("#lines [data-day]").getByRole("button")).toHaveCount(0); // the lines are links to their detail, never a control
  await expect(page.getByRole("button", { name: /Save|Remove/ })).toHaveCount(0); // nothing chosen: no line's controls
  await expect(page.getByRole("button", { name: /Send|WhatsApp/ })).toHaveCount(0);
});

test("1. the day / week / fortnight filter changes the lines shown", async ({ page }) => {
  await open(page, "span=fortnight");
  const fortnight = await page.locator("li[data-line]").count();
  await open(page, "span=day");
  const day = await page.locator("li[data-line]").count();
  expect(day).toBeLessThan(fortnight);
});

test("2. a line with no quantity carries the amber 'to confirm' chip, a line with one does not", async ({ page }) => {
  await open(page);
  await expect(line(page, "Beads").locator('[data-chip="toConfirm"]')).toHaveCount(1);
  await expect(line(page, "Craft paper").locator('[data-chip="toConfirm"]')).toHaveCount(0);
});

test("3. each line names its activity, and the line's panel links to the activity", async ({ page }) => {
  await open(page);
  await expect(line(page, "Dustbin")).toContainText("Proper Use Of Dustbin");
  await line(page, "Dustbin").locator("[data-open-key]").click();
  const panel = page.locator("[data-block=DetailPanel][data-panel=open]");
  await panel.getByRole("tab", { name: "Activity" }).click();
  await expect(panel.getByRole("link", { name: "Proper Use Of Dustbin" })).toHaveAttribute("href", /ACT-K2-0287/);
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
  // the notes are read by the coordinator role (as in m1-09-materials.spec.ts)
  await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by) select ${tenant}, ${staff}, 'coordinator', current_date - 1, 'u74 test'
            where not exists (select 1 from staff_role_grant where staff_id = ${staff} and role_code = 'coordinator' and granted_by = 'u74 test' and valid_to is null)`;
  const [{ id: list }] = await sql<{ id: string }[]>`select id from materials_list where school_class_id = ${klass} order by created_at desc limit 1`;
  await sql`insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, reason, staff_id, machine)
    values (${tenant}, gen_random_uuid(), 'materials_note', ${list}, ${sql.json({ text: "Placeholder note: UI-9 lolly sticks" })},
            'needs_person', 'Placeholder: not in the catalogue', ${staff}, 'materials_read')`;
  await open(page, "span=fortnight&show=notes");
  await expect(page.getByText("UI-9 lolly sticks").first()).toBeVisible(); // a note of an earlier run waits too (notes are append-only)
  await expect(page.locator("[data-line]")).toHaveCount(0);
});

test("6. a class that is not hers is not found", async ({ page }) => {
  await page.goto(`/timetable/materials?class=00000000-0000-0000-0000-000000000000&day=${TUESDAY}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("7. the old materials pages still open, and the school's list is the school tab of Materials", async ({ page }) => {
  for (const p of ["/educator/materials", "/timetable/materials?tab=school&day=2026-12-01", "/educator/materials/review"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
  }
});
