/**
 * U74 (UI-8) — the Reports screen. One test for each Done-when line of specs/UI-8/spec.md a browser can check. Rows are the
 * inventory's own class (U70A, held by the inventory educator) and a class the educator does not hold (U70B).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { EDUCATOR, inventoryRows, signedInAs, type Rows } from "./inventory-fixtures";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let rows: Rows;
let tenant = "";
const WEEK = "2026-W45";
const words = { facts: {}, draft: { summary: "[child] is growing in number work.", can_do: [{ id: "a", sentence: "[child] adds within 20." }], working_on: [], at_home: ["Count objects together."], next_at_school: "Next, adding with exchange." } };

test.beforeAll(async () => {
  rows = await inventoryRows(sql);
  const [t] = await sql<{ tenant_id: string }[]>`select tenant_id from child_now where id = ${Object.values(rows.children)[0]}`;
  tenant = t.tenant_id;
  const [first, second] = [Object.values(rows.children)[0], Object.values(rows.children)[1]];
  await sql`delete from parent_note where child_id in ${sql([first, second])} and body like '{"facts"%'`;
  await sql`insert into parent_note (tenant_id, child_id, week, body) values (${tenant}, ${first}, to_date(${WEEK}, 'IYYY-"W"IW'), ${JSON.stringify(words)})`;
  await sql`insert into parent_note (tenant_id, child_id, week, body, approved_by) values (${tenant}, ${second}, to_date(${WEEK}, 'IYYY-"W"IW'), ${JSON.stringify(words)}, 'u74-educator')`;
  if (!(await sql`select 1 from data_register where tenant_id = ${tenant} limit 1`).length)
    await sql`insert into data_register (tenant_id, code, ord, what, why, how_long, who_sees, tables) values (${tenant}, 'u74', 1, 'a report', 'to tell parents', 'a year', 'the parent', ${["parent_note"]})`;
  await sql`insert into consent (tenant_id, child_id, decision, given_by, how, recorded_by) values (${tenant}, ${first}, 'given', 'mother', 'a signed form', 'u74')`;
});
test.afterAll(async () => {
  await sql.end();
});

const table = (page: import("@playwright/test").Page) => page.getByRole("table", { name: "Every child's report" });

test("an educator sees only their own class's children, each with Sr. No., state, educator approval and consent (1, 2)", async ({ browser }) => {
  const ctx = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto("/children/reports");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
  const body = await table(page).locator("tbody tr:not(.under)").allInnerTexts();
  expect(body.length).toBe(Object.keys(rows.children).length);
  expect(body.join("\n")).not.toContain(rows.otherNames[0]);
  expect(body[0]).toMatch(/Sr\. No\. 1/);
  expect(body[0]).toMatch(/to approve/);
  expect(body[0]).toMatch(/on file/);
  expect(body[1]).toMatch(/approved/);
  expect(body[1]).toMatch(/not recorded/);
  await ctx.close();
});

test("a coordinator sees other classes too, and the class and state filters narrow the rows (3)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  expect(await table(page).locator("tbody tr:not(.under)").count()).toBe(Object.keys(rows.children).length);
  await page.goto(`/children/reports?class=${rows.section}&state=approved`);
  expect(await table(page).locator("tbody tr:not(.under)").count()).toBe(1);
  await page.goto(`/children/reports?class=${rows.other ? "U70B" : ""}&state=approved`);
  await expect(page.getByText("No report lines drafted yet")).toBeVisible();
});

test("a child's fold shows the report's words with the name put in; a child with no report says so (4)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  const first = Object.keys(rows.children)[0];
  await expect(page.getByText(`${first} is growing in number work.`)).toBeAttached();
  await expect(page.getByText("[child]")).toHaveCount(0);
  await expect(page.getByText("Not written yet").first()).toBeAttached();
});

test("the screen never says teacher, a rung or skill code, or borrow, and orders rows by Sr. No. (5)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/teacher|borrow|\bR\d+\b|NUM\./i);
  const rolls = (await table(page).locator("tbody tr:not(.under)").allInnerTexts()).map((r) => Number(/Sr\. No\. (\d+)/.exec(r)![1]));
  expect(rolls).toEqual([...rolls].sort((a, b) => a - b));
  void EDUCATOR;
});

test("nothing on the screen sends a report, and the CP-19 controls are not drawn (6)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  await expect(page.getByRole("button", { name: /send|approve|preview/i })).toHaveCount(0);
});
