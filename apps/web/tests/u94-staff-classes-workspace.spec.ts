/**
 * U94 — Staff · Classes as the page charter's Part C line draws them: "Staff · Classes: keep, Workspace" (docs/frontend/page-charter.md,
 * with Part A's Workspace: the list on the left, the chosen thing in the detail panel on the right, the address carrying it). Staff: a
 * person's grants and roles in the panel, a grant given and ended there. Classes: a class's children and moves in the panel, a child moved
 * there. Names only through the reads that decide who may see them (`namesMayShow`, `pii.read_child`). The rows are the spec's own: a
 * person named from tests/fake-names.ts and two classes of fake children, U94A and U94B, used by no other spec.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN, FAKE_STAFF } from "./fake-names";
import { inventoryRows, signedInAs } from "./inventory-fixtures";
import { aClass, aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const FROM = "U94A";
const TO = "U94B";
const PERSON = { email: "u94-staff@cornerstone.test", name: FAKE_STAFF[5], role: "educator", classes: [] as string[] };
const MOVER = FAKE_CHILDREN[2];
let person = "";
let fromId = "";
let toId = "";

const today = async () => (await sql<{ d: string }[]>`select (now() at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date::text as d`)[0].d;

test.beforeAll(async () => {
  await inventoryRows(sql);
  person = (await aPerson(sql, PERSON)).id;
  // the mover starts in U94A every run: an earlier run's move is put back first (a move is a new enrolment; nothing is undone)
  const [moved] = await sql<{ id: string }[]>`select cn.id::text from child_now cn join pii.child p on p.child_id = cn.id where cn.section = ${TO} and p.first_name || ' ' || p.last_name = ${MOVER} limit 1`;
  if (moved) await sql`select move_child(${moved.id}::uuid, 'K2', ${FROM}, '3', 'e2e@cornerstone.test', '', now())`;
  await aClass(sql, FROM, "K2", FAKE_CHILDREN.slice(0, 3) as unknown as string[]);
  await aClass(sql, TO, "K2", FAKE_CHILDREN.slice(3, 5) as unknown as string[]);
  [{ id: fromId }] = await sql<{ id: string }[]>`select id::text from school_class where label = ${FROM} order by created_at limit 1`;
  [{ id: toId }] = await sql<{ id: string }[]>`select id::text from school_class where label = ${TO} order by created_at limit 1`;
  // the person holds one class grant, open today, so the panel has a grant to read and to end
  const day = await today();
  await sql`update staff_role_grant set valid_to = greatest(valid_from, ${day}::date) where staff_id = ${person}::uuid and (valid_to is null or valid_to > ${day}::date)`;
  await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select s.tenant_id, s.id, 'assistant', ${fromId}::uuid, ${day}::date, 'u94' from staff s where s.id = ${person}::uuid`;
});
test.afterAll(async () => {
  const day = await today();
  await sql`update staff_role_grant set valid_to = greatest(valid_from, ${day}::date) where staff_id = ${person}::uuid and (valid_to is null or valid_to > ${day}::date)`;
  await sql.end();
});

const panel = (page: Page) => page.locator("[data-block=DetailPanel]");

test("Staff is a Workspace: the staff on the left, the summary on the right until a person is chosen; the person opens on the right with Grants · Roles, and Escape closes it", async ({ page }) => {
  await page.goto("/setup/staff", { waitUntil: "networkidle" });
  await expect(page.locator("[data-ux=action]").getByRole("button", { name: "Add a person" })).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(panel(page).locator("[data-stat=staff] .b-stat-n")).toHaveText(/^\d+$/);
  const row = page.locator(`main [data-staff-row][data-open-key="person:${person}"]`);
  await expect(row).toHaveText(PERSON.name);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`[?&]open=person%3A${person}`));
  expect(page.url()).not.toContain(PERSON.name.split(" ")[0]); // the address carries the id, never the name
  await expect(panel(page)).toHaveAttribute("data-panel", "open");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(PERSON.name);
  await expect(panel(page).getByRole("tab")).toHaveText(["Grants", "Roles"]);
  await expect(panel(page).locator("[data-grants]")).toContainText(FROM);
  await panel(page).getByRole("tab", { name: "Roles" }).click();
  await expect(page).toHaveURL(/[?&]tab=roles/);
  await expect(panel(page).locator("[data-roles]")).toContainText(FROM);
  await expect(panel(page).locator("[data-roles] [data-block=KeyValue]")).toContainText("Sessions done of planned");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(row).toBeFocused();
});

test("Staff: a grant is ended in the panel, and stays listed, marked Ended; the old ?person= address opens the same panel", async ({ page }) => {
  await page.goto(`/setup/staff?person=${person}`, { waitUntil: "networkidle" });
  await expect(panel(page)).toHaveAttribute("data-open", `person:${person}`);
  const [g] = await sql<{ id: string }[]>`select id::text from staff_role_grant where staff_id = ${person}::uuid and valid_to is null order by created_at desc limit 1`;
  const grant = panel(page).locator(`[data-grant="${g.id}"]`);
  await grant.getByRole("button", { name: /^End a grant/ }).click();
  await expect(grant).toContainText("Ended");
  const [after] = await sql<{ valid_to: string | null }[]>`select valid_to::text from staff_role_grant where id = ${g.id}::uuid`;
  expect(after.valid_to).toBe(await today());
  // Add a grant opens its form in the panel, under the person's grants
  await panel(page).getByRole("button", { name: "Add a grant" }).click();
  await expect(panel(page).getByRole("form", { name: "Add a grant" })).toBeVisible();
});

test("Classes is a Workspace: a class opens on the right with its Children (Sr. No. and name) and its Moves, and Escape closes it", async ({ page }) => {
  await page.goto("/setup/classes", { waitUntil: "networkidle" });
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(panel(page).locator("[data-stat=classes] .b-stat-n")).toHaveText(/^\d+$/);
  const row = page.locator(`main [data-class-row][data-open-key="class:${fromId}"]`);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`[?&]open=class%3A${fromId}`));
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(FROM);
  await expect(panel(page).getByRole("tab")).toHaveText(["Children", "Moves"]);
  const kids = panel(page).getByRole("table", { name: `${FROM} children` });
  for (const [i, n] of FAKE_CHILDREN.slice(0, 2).entries()) await expect(kids.locator("tbody tr").filter({ hasText: n }).locator("td").first()).toContainText(`${i + 1} ${n}`);
  await panel(page).getByRole("tab", { name: "Moves" }).click();
  await expect(panel(page).locator("[data-tab-body=moves]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(row).toBeFocused();
});

test("Classes: a child is moved from the class's panel; the panel stays on the class and its Moves tab lists the move, with no name", async ({ page }) => {
  await page.goto(`/setup/classes?open=class:${fromId}`, { waitUntil: "networkidle" });
  await panel(page).getByRole("button", { name: `Move 3 ${MOVER}` }).click();
  await panel(page).getByLabel("To class").selectOption(TO);
  await panel(page).getByLabel("Sr. No. there").fill("9");
  await panel(page).getByRole("button", { name: "Save the move" }).click();
  await page.waitForURL(/moved=1/);
  await expect(panel(page)).toHaveAttribute("data-open", `class:${fromId}`);
  await expect(panel(page).getByRole("table", { name: `${FROM} children` })).not.toContainText(MOVER);
  await panel(page).getByRole("tab", { name: "Moves" }).click();
  const moves = panel(page).locator("[data-moves]");
  await expect(moves).toContainText(`Sr. No. 9 moved from ${FROM} to ${TO}.`);
  for (const n of FAKE_CHILDREN) expect(await moves.innerText()).not.toContain(n);
  await page.goto(`/setup/classes?open=class:${toId}`, { waitUntil: "networkidle" });
  await expect(panel(page).getByRole("table", { name: `${TO} children` })).toContainText(`9 ${MOVER}`);
});

test("names only for a viewer who may see them: an educator is shown neither page's list nor its panel", async ({ browser }) => {
  const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const page = await context.newPage();
  for (const at of [`/setup/staff?open=person:${person}`, `/setup/classes?open=class:${fromId}`]) {
    await page.goto(at, { waitUntil: "networkidle" });
    await expect(page.locator("[data-block=DetailPanel]")).toHaveCount(0);
    const text = await page.locator("main").innerText();
    for (const n of [PERSON.name, ...FAKE_CHILDREN.slice(0, 3)]) expect(text).not.toContain(n);
  }
  await context.close();
});
