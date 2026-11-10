/**
 * U73 (UI-5) — the coordinator's pages: Staff and classes (/setup/staff), Classes and children (/setup/classes) and Setup (/setup).
 * One test for each "Done when" line of issue #520 that the inventory test (u70-inventory) does not already prove; line 1 and 5
 * (the generic checks, every listed control) are the inventory's, and the first test here holds that this slice is in it.
 * Rows are the test's own (a pair of classes with a random label, children named from tests/fake-names.ts), made once per run.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN, FAKE_STAFF } from "./fake-names";
import { EDUCATOR, inventoryRows, signedInAs } from "./inventory-fixtures";
import { loadInventory } from "./inventory/load";
import { aClass } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const tag = Math.random().toString(36).slice(2, 5).toUpperCase();
const FROM = `U73${tag}A`;
const TO = `U73${tag}B`;
const KIDS = FAKE_CHILDREN.slice(0, 3) as unknown as string[];
const MOVER = KIDS[0];
let fromId = "";
let toId = "";
let moverId = "";

test.beforeAll(async () => {
  await inventoryRows(sql); // the educator
  const kids = await aClass(sql, FROM, "K2", KIDS);
  await aClass(sql, TO, "K2", FAKE_CHILDREN.slice(5, 7) as unknown as string[]);
  moverId = kids[MOVER];
  [{ id: fromId }] = await sql<{ id: string }[]>`select id from school_class where label = ${FROM} order by created_at limit 1`;
  [{ id: toId }] = await sql<{ id: string }[]>`select id from school_class where label = ${TO} order by created_at limit 1`;
});
test.afterAll(async () => {
  await sql.end();
});

const seen = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
};

test("1 and 5. this slice is in the inventory, so u70 drives all three screens as the coordinator", () => {
  const inv = loadInventory();
  expect(inv.merged_slices).toContain("UI-5");
  const ids = inv.slices.find((s) => s.id === "UI-5")!.screens;
  expect(ids.sort()).toEqual(["classes", "setup", "staff"]);
});

test("2. the old School address answers 308 to Classes and children", async ({ request }) => {
  const r = await request.get("/school", { maxRedirects: 0 });
  expect(r.status()).toBe(308);
  expect(new URL(r.headers().location, "http://localhost:3100").pathname).toBe("/setup/classes");
});

test("3 and 6. Staff has nothing that ranks or sorts: no sort link, no aria-sort, no ordinal, no percentage, no grading colour", async ({ page }) => {
  const text = await seen(page, "/setup/staff");
  await expect(page.locator("main table th a")).toHaveCount(0);
  await expect(page.locator("main [aria-sort]")).toHaveCount(0);
  expect(text).not.toMatch(/\b(rank|ranked|top|best|worst|score|1st|2nd|3rd|\d+th)\b/i);
  expect(text).not.toMatch(/\d\s*%/);
  // the order is the role's own, then name: the same however the address asks (a sort asked for is ignored)
  const first = await page.locator("main table tbody tr td:first-child").allInnerTexts();
  await page.goto("/setup/staff?sort=late&dir=desc", { waitUntil: "networkidle" });
  expect(await page.locator("main table tbody tr td:first-child").allInnerTexts()).toEqual(first);
  // a count is not coloured: its cells carry no state colour class or inline colour
  const coloured = await page.locator("main table td.num").evaluateAll((cells) => cells.filter((c) => c.querySelector("[data-state], .chip") || (c as HTMLElement).style.color).length);
  expect(coloured).toBe(0);
});

test("7. a grant is never deleted: the database refuses it and visiting the pages leaves the count as it was", async ({ page }) => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from staff_role_grant`;
  await seen(page, "/setup/staff");
  await seen(page, "/setup/classes");
  await expect(sql`delete from staff_role_grant`).rejects.toThrow();
  const [{ n: after }] = await sql<{ n: number }[]>`select count(*)::int as n from staff_role_grant`;
  expect(after).toBe(n);
});

test("8. no staff name is shown unless the viewer is in the everything group", async ({ browser, page }) => {
  const [{ name }] = await sql<{ name: string }[]>`select name from pii.staff where email = 'e2e@cornerstone.test'`;
  expect(await seen(page, "/setup/staff")).toContain(name);
  const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const edu = await context.newPage();
  for (const path of ["/setup/staff", "/setup/classes"]) {
    const text = await seen(edu, path);
    for (const n of [name, EDUCATOR.name, ...FAKE_STAFF]) expect(text, `${path} shows ${n} to an educator`).not.toContain(n);
  }
  await context.close();
});

test("4 and 9. a move closes the enrolment, opens a new one, writes the change log and deletes nothing; both classes show it next render", async ({ page }) => {
  const count = async () => {
    const [r] = await sql<{ e: number; open: number; c: number; l: number; ch: number }[]>`
      select (select count(*) from enrolment where child_id = ${moverId})::int as e,
             (select count(*) from enrolment where child_id = ${moverId} and to_date is null)::int as open,
             (select count(*) from child where id = ${moverId})::int as c,
             (select count(*) from change_log where table_name = 'child' and op = 'move' and row_id = ${moverId}::text)::int as l,
             (select count(*) from enrolment)::int as ch`;
    return r;
  };
  const before = await count();
  expect(before.open).toBe(1);
  await page.goto(`/setup/classes?class=${fromId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Move 1 ${MOVER}` }).click();
  await page.getByLabel("To class").selectOption(TO);
  await page.getByLabel("Sr. No. there").fill("9");
  await page.getByRole("button", { name: "Save the move" }).click();
  await page.waitForURL(/moved=1/);
  const after = await count();
  expect(after.e).toBe(before.e + 1); // a new enrolment, the old one kept
  expect(after.open).toBe(1);
  expect(after.c).toBe(1); // the child is not deleted
  expect(after.l).toBe(before.l + 1);
  const [old] = await sql<{ to_date: string | null }[]>`select to_date::text from enrolment where child_id = ${moverId} and class_id = ${fromId}`;
  expect(old.to_date).not.toBeNull();
  const [now] = await sql<{ label: string; roll_no: string }[]>`select section as label, roll_no from child_now where id = ${moverId}`;
  expect(now).toEqual({ label: TO, roll_no: "9" });
  // the class picture of both classes, on the next render
  expect(await seen(page, `/setup/classes?class=${toId}`)).toContain(MOVER);
  expect(await seen(page, `/setup/classes?class=${fromId}`)).not.toContain(MOVER);
});

test("10 and 11. each child row shows the name beside the Sr. No.; the address and the log carry no name; the log lists the move with who and when", async ({ page }) => {
  await page.goto(`/setup/classes?class=${toId}`, { waitUntil: "networkidle" });
  const row = page.locator("main table tbody tr").filter({ hasText: MOVER });
  await expect(row.locator("td").first()).toContainText(`9 ${MOVER}`);
  expect(page.url()).not.toContain(MOVER.split(" ")[0]);
  const fold = page.locator("details[data-fold=change-log]");
  await fold.locator("summary").click();
  const log = await fold.innerText();
  expect(log).toMatch(new RegExp(`Sr. No. 9 moved from ${FROM} to ${TO}\\. By .+ on \\d{4}-\\d{2}-\\d{2}`));
  for (const n of FAKE_CHILDREN) expect(log).not.toContain(n);
  const [stored] = await sql<{ t: string }[]>`select (before::text || after::text || coalesce(reason, '') || coalesce(origin, '')) as t from change_log where table_name = 'child' and op = 'move' and row_id = ${moverId}::text`;
  for (const n of FAKE_CHILDREN) expect(stored.t).not.toContain(n);
});

test("12. every setup page is two clicks from the bar", async ({ page }) => {
  await page.goto("/today", { waitUntil: "networkidle" });
  const bar = page.locator("[data-bar]").getByRole("navigation", { name: "Sections" });
  await bar.getByRole("link", { name: /^Setup/ }).click();
  await expect(page.locator("h1")).toHaveText("Setup");
  for (const [card, title] of [["Staff", "Staff and classes"], ["Classes and children", "Classes and children"]] as const) {
    await page.locator("main").getByRole("link", { name: card, exact: true }).click();
    await expect(page.locator("h1")).toHaveText(title);
    await page.goBack();
    await expect(page.locator("h1")).toHaveText("Setup");
  }
});

test("13. an educator sees only the cards their group may open", async ({ browser, page }) => {
  const names = async (p: Page) => (await p.locator("main [data-block=Cards] a").allInnerTexts()).map((t) => t.trim());
  await page.goto("/setup", { waitUntil: "networkidle" });
  expect(await names(page)).toEqual(expect.arrayContaining(["Staff", "Classes and children", "Skills to approve"]));
  const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const edu = await context.newPage();
  await edu.goto("/setup", { waitUntil: "networkidle" });
  const theirs = await names(edu);
  for (const hidden of ["Staff", "Classes and children", "Skills to approve"]) expect(theirs).not.toContain(hidden);
  expect(theirs).toContain("Question bank");
  await context.close();
});
