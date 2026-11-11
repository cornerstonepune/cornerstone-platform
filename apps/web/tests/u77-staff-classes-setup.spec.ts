/**
 * U77 (UI-5) — Staff and classes, Classes and children and Setup as their wireframes draw them (docs/frontend/wireframes/{staff,classes,setup}.html).
 * One test for each thing the wireframes show that the first builds did not:
 *   1 Staff: each role group's heading says how many people it holds
 *   2 Staff: "Last changes to grants" lists the latest gives and ends, newest first, with who did it
 *   3 Classes: each class has its Class picture link; a class's children are in two groups, moved in this year first
 *   4 Setup: the School card (campus, year) and "Changed lately" (the move and the grant, in words, newest first)
 * Rows are the test's own (two classes with a random label, a person, children named from tests/fake-names.ts), made once per run.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import built from "../design-system/built.json";
import { ENGINE_PORT } from "../playwright.config";
import { FAKE_CHILDREN } from "./fake-names";
import { inventoryRows } from "./inventory-fixtures";
import { aClass, aPerson, forgetPerson } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const tag = Math.random().toString(36).slice(2, 5).toUpperCase();
const FROM = `U77${tag}A`;
const TO = `U77${tag}B`;
const KIDS = FAKE_CHILDREN.slice(0, 3) as unknown as string[];
const MOVER = KIDS[0];
const PERSON = { email: `u77-${tag.toLowerCase()}@cornerstone.test`, name: "Changes Person", role: "educator", classes: [] as string[] };
const COORDINATOR = "e2e@cornerstone.test"; // the person the run signs in as (global-setup)
let person = "";
let fromId = "";
let toId = "";

const engine = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(`http://127.0.0.1:${ENGINE_PORT}${path}`, { method: "POST", headers: { "content-type": "application/json", "X-Engine-Key": process.env.E2E_ENGINE_KEY! }, body: JSON.stringify({ actor: COORDINATOR, ...body }) });
  expect(res.ok, `${path}: ${await res.clone().text()}`).toBe(true);
  return (await res.json()) as Record<string, string>;
};

test.beforeAll(async () => {
  await inventoryRows(sql);
  await aClass(sql, FROM, "K2", KIDS);
  await aClass(sql, TO, "K2", FAKE_CHILDREN.slice(5, 7) as unknown as string[]);
  person = (await aPerson(sql, PERSON)).id;
  [{ id: fromId }] = await sql<{ id: string }[]>`select id from school_class where label = ${FROM} order by created_at limit 1`;
  [{ id: toId }] = await sql<{ id: string }[]>`select id from school_class where label = ${TO} order by created_at limit 1`;
});
test.afterAll(async () => {
  await sql`update staff_role_grant set valid_to = current_date where staff_id = ${person}::uuid and (valid_to is null or valid_to > current_date)`;
  await forgetPerson(sql, PERSON.email);
  await sql.end();
});

test("1. each role group of Staff says how many people it holds", async ({ page }) => {
  await page.goto("/setup/staff", { waitUntil: "networkidle" });
  const groups = page.locator("main section[aria-label] > h3");
  expect(await groups.count(), "at least one role group").toBeGreaterThan(0);
  for (const h of await groups.all()) {
    const n = Number((await h.innerText()).match(/(\d+)\s*$/)?.[1]);
    expect(n, `“${await h.innerText()}” ends in how many`).toBeGreaterThan(0);
    const rows = await h.locator("xpath=..").locator("tbody tr").count();
    expect(rows, "a group shows its people, ten at most (rule 3)").toBe(Math.min(n, 10));
  }
});

test("2. “Last changes to grants” lists the latest give and end, newest first, with who did it", async ({ page }) => {
  const given = await engine("/staff/grants/give", { staff_id: person, role: "assistant", class_label: TO });
  await engine("/staff/grants/end", { grant_id: given.grant_id });
  await page.goto("/setup/staff", { waitUntil: "networkidle" });
  const list = page.getByRole("region", { name: "Last changes to grants" }).getByRole("listitem");
  await expect(list.first()).toContainText(`${PERSON.name}: Assistant, ${TO}, every subject, ended`);
  await expect(list.first()).toContainText("Ended by");
  await expect(list.nth(1)).toContainText(`${PERSON.name}: Assistant, ${TO}, every subject, from`);
  await expect(list.nth(1)).toContainText("Added by");
  expect(await page.url()).not.toContain(PERSON.name.split(" ")[0]);
});

test("3. each class has its Class picture link, and its children are in two groups, moved in this year first", async ({ page }) => {
  await page.goto(`/setup/classes?class=${fromId}`, { waitUntil: "networkidle" });
  const row = page.getByRole("table", { name: "Classes" }).locator("tr", { hasText: FROM });
  // the link is drawn once the picture screen is built (no dead link: lib/built.ts), and then it is that class's own
  if ((built.screens as Record<string, { built: boolean }>).picture?.built) await expect(row.getByRole("link", { name: "Class picture" })).toHaveAttribute("href", new RegExp(`^/children/${fromId}`));
  else await expect(row.getByRole("link", { name: "Class picture" })).toHaveCount(0);
  await page.getByRole("button", { name: `Move 1 ${MOVER}` }).click();
  await page.getByLabel("To class").selectOption(TO);
  await page.getByLabel("Sr. No. there").fill("9");
  await page.getByRole("button", { name: "Save the move" }).click();
  await page.waitForURL(/moved=1/);
  await page.goto(`/setup/classes?class=${toId}`, { waitUntil: "networkidle" });
  const heads = await page.locator("main section[aria-label$='its children'] h3").allInnerTexts();
  expect(heads.map((h) => h.replace(/\s+/g, " ").trim())).toEqual(["Moved in this year 1", "Here since the year began 2"]);
  await expect(page.getByRole("table", { name: `${TO} children · Moved in this year` })).toContainText(MOVER);
  await expect(page.getByRole("table", { name: `${TO} children · Here since the year began` })).not.toContainText(MOVER);
});

test("4. Setup shows the School card and, as “Changed lately”, the move and the grant in words, newest first", async ({ page }) => {
  await page.goto("/setup", { waitUntil: "networkidle" });
  const school = page.locator("[data-block=Cards] article", { has: page.getByText("School", { exact: true }) });
  await expect(school).toContainText("Campus ");
  await expect(school).toContainText("Year ");
  const lately = page.getByRole("region", { name: "Changed lately" }).getByRole("listitem");
  await expect(lately.first()).toContainText(`A child moved class: Sr. No. 9, ${FROM} to ${TO}`);
  await expect(lately.nth(1)).toContainText("A grant ended: Changes Person");
  await expect(lately.nth(2)).toContainText("A grant added: Changes Person");
});
