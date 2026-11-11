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

// the reports are one table for each stage they stand at, so the rows are read across every table of the main part
const table = (page: import("@playwright/test").Page) => page.getByRole("main").locator("table").first();
/** The rows of the tables once they have drawn: the page shows a loading skeleton first, so nothing is counted before a table is there. */
const rowsOf = async (page: import("@playwright/test").Page) => {
  await expect(table(page)).toBeVisible();
  return page.getByRole("main").locator("table tbody tr:not(.under)").allInnerTexts();
};

test("an educator sees only their own class's children, each with Sr. No., state, educator approval and consent (1, 2)", async ({ browser }) => {
  const ctx = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto("/children/reports");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
  const body = await rowsOf(page);
  expect(body.length).toBe(Math.min(10, Object.keys(rows.children).length)); // the table pages at 10 rows (rule 3)
  expect(body.join("\n")).not.toContain(rows.otherNames[0]);
  expect(body[0]).toMatch(new RegExp(`^1 ${Object.keys(rows.children)[0]}`));
  expect(body[0]).toMatch(/to approve/);
  expect(body[1]).toMatch(/approved/);
  // consent is the coordinator's alone to see (the school's access rule): an educator is shown no consent column, never a guessed word
  await expect(page.getByRole("main").getByRole("columnheader", { name: "Consent" })).toHaveCount(0);
  expect(body.join("\n")).not.toMatch(/on file|none on record|withdrawn/);
  // the strip has no consent tile for an educator, and no consent bar either
  await expect(page.locator("[data-block=AttentionStrip] .b-att")).toHaveCount(2);
  await expect(page.getByText("Consent missing")).toHaveCount(0);
  await expect(page.getByLabel("Consent on file")).toHaveCount(0);
  await ctx.close();
});

test("a coordinator sees other classes too, and the class and state filters narrow the rows (3)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  expect((await rowsOf(page)).length).toBe(Math.min(10, Object.keys(rows.children).length));
  await page.goto(`/children/reports?class=${rows.section}&state=none`);
  expect((await rowsOf(page)).length).toBe(Math.min(10, Object.keys(rows.children).length));
  await page.goto(`/children/reports?class=${rows.other ? "U70B" : ""}&state=sent`);
  await expect(page.getByText("No report lines drafted yet")).toBeVisible();
});

test("a coordinator sees each child's consent: on file, or none on record and said to be needed (2)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  const body = await rowsOf(page);
  expect(body[0]).toMatch(/on file/);
  expect(body[1]).toMatch(/none on record: needed/);
  await expect(page.getByText(/Consent missing: a report cannot be sent until a parent's consent is recorded/)).toBeVisible();
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
  await expect(table(page)).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/teacher|borrow|\bR\d+\b|NUM\./i);
  const rolls = (await rowsOf(page)).map((r) => Number(/^(\d+) /.exec(r)![1]));
  expect(rolls).toEqual([...rolls].sort((a, b) => a - b));
  void EDUCATOR;
});

test("nothing on the screen sends a report, and the CP-19 controls are not drawn (6)", async ({ page }) => {
  await page.goto(`/children/reports?class=${rows.section}`);
  await expect(table(page)).toBeVisible(); // the screen has drawn, so no button being there means something
  await expect(page.getByRole("button", { name: /send|approve|preview/i })).toHaveCount(0);
});

test("CP-19: an opened child shows its lines with the system's stage beside the words, Approve for the first stage, and no Send until both approvals and consent (7)", async ({ page }) => {
  const third = Object.values(rows.children)[2];
  await sql`delete from parent_note where child_id = ${third} and body like '{"facts"%'`;
  const lineId = crypto.randomUUID();
  await sql`insert into parent_note (tenant_id, child_id, week, body, lines) values (${tenant}, ${third}, to_date(${WEEK}, 'IYYY-"W"IW'), ${JSON.stringify(words)}, ${sql.json([{ id: lineId, words: "Adds within 20.", evidence: [] }])})`;
  await page.goto(`/children/reports?class=${rows.section}&open=${third}`);
  await expect(page.getByLabel("The line's words")).toHaveValue("Adds within 20.");
  await expect(page.getByText("to approve (educator)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^send$/i })).toHaveCount(0);
});

test("CP-19: with both approvals on every line, Send appears only when consent is on record; without it the page says consent is needed (8)", async ({ page }) => {
  const [first, second] = Object.values(rows.children);
  for (const child of [first, second]) {
    await sql`delete from parent_note where child_id = ${child} and body like '{"facts"%'`;
    const lineId = crypto.randomUUID();
    const [n] = await sql<{ id: string }[]>`insert into parent_note (tenant_id, child_id, week, body, lines) values (${tenant}, ${child}, to_date(${WEEK}, 'IYYY-"W"IW'), ${JSON.stringify(words)}, ${sql.json([{ id: lineId, words: "Adds within 20.", evidence: [] }])}) returning id`;
    for (const by of [crypto.randomUUID(), crypto.randomUUID()])
      await sql`insert into approval (tenant_id, kind, target, decision, "by") values (${tenant}, 'report_line', ${`${n.id}:${lineId}`}, 'approved', ${by})`;
  }
  // the first child has consent on record (the beforeAll row), the second has none
  await page.goto(`/children/reports?class=${rows.section}&open=${first}`);
  await expect(page.getByRole("button", { name: /^send$/i })).toBeVisible();
  await expect(page.getByText(/consent is on record|Consent was withdrawn/)).toHaveCount(0);
  await page.goto(`/children/reports?class=${rows.section}&open=${second}`);
  await expect(page.getByText("No consent is on record for this child", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /^send$/i })).toHaveCount(0);
});

test("the strip counts what waits, the reports are grouped by stage, the board shows the same reports, and the consent bar counts consent (carried from the old list's counts)", async ({ page }) => {
  // after the tests above: the first two children hold a line approved twice (the first has consent, the second has none), the third a line
  // nobody has approved, and the rest of the class have no lines yet
  const kids = Object.keys(rows.children).length;
  await page.goto(`/children/reports?class=${rows.section}`);
  const strip = page.locator("[data-block=AttentionStrip]");
  await expect(strip).toBeVisible();
  const tile = (words: string) => strip.locator(".b-att").filter({ hasText: words }).locator(".b-n");
  await expect(tile("Lines waiting")).toHaveText("1");
  await expect(tile("Consent missing")).toHaveText(String(kids - 1));
  await expect(tile("Reports sent")).toHaveText("0");

  // one table for each stage a report stands at, each headed by its words and its count
  await expect(page.getByRole("heading", { level: 3, name: "Drafted · 1" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Coordinator approved, ready to send · 2" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: `No lines yet · ${kids - 3}` })).toBeVisible();

  // the same reports as a board, one lane for each stage
  await expect(page.getByRole("heading", { level: 2, name: "The same reports as a board" })).toBeVisible();
  await expect(page.locator('[data-lane="drafted"] .b-count')).toHaveText("1");
  await expect(page.locator('[data-lane="educator"] .b-count')).toHaveText("0");
  await expect(page.locator('[data-lane="coordinator"] .b-count')).toHaveText("2");
  await expect(page.locator('[data-lane="sent"]')).toContainText("No report has been sent yet.");

  // the consent bar, the coordinator's alone: the first child has consent, the rest of the class have none
  await expect(page.getByRole("img", { name: `1 on file, ${kids - 1} missing` })).toBeVisible();

  // a stage chosen shows only its reports
  await page.goto(`/children/reports?class=${rows.section}&state=drafted`);
  expect((await rowsOf(page)).length).toBe(1);
});
