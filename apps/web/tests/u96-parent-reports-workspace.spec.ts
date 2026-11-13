/**
 * U96 — Parent reports as the page charter's Part C keeps it ("keep, last"), reshaped to the frame's Workspace (A5): the list on the left, a
 * child's report on the right with its existing actions, and with none chosen the page's summary as stat tiles (A2). One test per line. The
 * class is the spec's own (U96R), its children from tests/fake-names.ts; the first child's report has one line nobody has approved, made
 * fresh each run. The report's rules (who approves, consent before a send) are u74's (tests/u74-reports.spec.ts).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aClass, aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U96R";
const EDUCATOR = { email: "u96-educator@cornerstone.test", name: "Reports Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };
const NAMES = FAKE_CHILDREN.slice(2, 5) as string[];
const words = { facts: {}, draft: { summary: "[child] counts on from a number.", can_do: [], working_on: [], at_home: [], next_at_school: "" } };
let first = "";
const HERE = `/children/reports?class=${SECTION}`;
const panel = (page: import("@playwright/test").Page) => page.locator("[data-block=DetailPanel]");

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G2", NAMES);
  first = kids[NAMES[0]];
  await aPerson(sql, EDUCATOR);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${first}`;
  await sql`delete from parent_note where child_id = ${first} and body like '{"facts"%'`;
  await sql`insert into parent_note (tenant_id, child_id, week, body, lines) values (${tenant}, ${first}, date_trunc('week', now())::date, ${JSON.stringify(words)}, ${sql.json([{ id: crypto.randomUUID(), words: "Counts on from a number.", evidence: [] }])})`;
});
test.afterAll(async () => {
  await sql.end();
});

test("Parent reports is kept: the page and its menu line under Children", async ({ page }) => {
  await page.goto(HERE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reports");
  await expect(page.locator("[data-sidebar] a[href='/children/reports']").first()).toHaveAttribute("aria-current", "page");
});

test("Workspace, left: the list of every child's report; right, with none chosen: what waits as stat tiles", async ({ page }) => {
  await page.goto(HERE);
  const list = page.getByRole("main").locator("table").first();
  await expect(list.locator(`tr[data-child="${first}"]`)).toContainText(NAMES[0].split(" ")[0]);
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(panel(page).locator("[data-stat=waiting]")).toBeVisible();
  await expect(panel(page).locator("[data-stat=sent]")).toBeVisible();
  // the same page never draws the old board or strip beside the list
  await expect(page.locator("[data-lane], [data-block=AttentionStrip]")).toHaveCount(0);
});

test("a child chosen opens their report on the right, in tabs, without leaving the page; Escape closes it", async ({ page }) => {
  await page.goto(HERE);
  await page.locator(`tr[data-child="${first}"] [data-open-key="report:${first}"]`).click();
  await expect(page).toHaveURL(new RegExp(`open=report%3A${first}`));
  await expect(panel(page).locator("[data-panel-title]")).toContainText(NAMES[0].split(" ")[0]);
  await expect(page.getByRole("tab")).toHaveText(["Lines", "Report", "Approvals"]);
  await page.getByRole("tab", { name: "Report" }).click();
  await expect(panel(page)).toContainText(`${NAMES[0]} counts on from a number.`);
  await expect(page.locator("[data-panel-full]")).toHaveAttribute("href", `/growth/${first}/parent`);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/open=/);
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
});

test("the report's existing actions are in its panel: the line's words saved, and it comes back open with what was said", async ({ page }) => {
  // only an educator of the child's class writes its lines (the engine refuses anyone else), so this one is its educator
  await page.context().addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  await page.goto(`${HERE}&open=report:${first}`);
  const line = panel(page).getByLabel("The line's words");
  await expect(line).toHaveValue("Counts on from a number.");
  await expect(panel(page).getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await line.fill("Counts on from any number to 20.");
  await panel(page).getByRole("button", { name: "Save words" }).click();
  await expect(page).toHaveURL(new RegExp(`open=report(:|%3A)${first}`));
  await expect(page.getByRole("status").filter({ hasText: /Saved|engine/ })).toBeVisible();
  await expect(panel(page).getByLabel("The line's words")).toHaveValue("Counts on from any number to 20.");
});
