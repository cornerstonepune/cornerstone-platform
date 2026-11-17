/**
 * U106 (CP-67, issue #827) — Curriculum as one tree: grade → subject → unit → objective. Nimish, 17 Nov 2026: "I just chose grade 2 and I
 * chose math, but then nothing is happening ... It can simply be thought of as an expand-collapse." One test for each Done-when line of
 * specs/CP-67/spec.md. The spec's own rows sit in Grade 2: two units of Maths, one objective with no unit, one of a second subject; the
 * figures are read back from the database.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G2";
const MATHS = "NUM";
let other = "";
let tenant = "";
const ROWS = [
  ["LO-U106-A1", "U106 unit A"],
  ["LO-U106-A2", "U106 unit A"],
  ["LO-U106-A3", "U106 unit A"],
  ["LO-U106-B1", "U106 unit B"],
  ["LO-U106-B2", "U106 unit B"],
  ["LO-U106-N1", ""], // no unit yet
] as const;
const ACT = "ACT-U106-A";

test.beforeAll(async () => {
  [{ id: tenant }] = await sql<{ id: string }[]>`select tenant_id as id from subject where code = ${MATHS} limit 1`;
  [{ code: other }] = await sql<{ code: string }[]>`select code from subject where tenant_id = ${tenant} and code <> ${MATHS} order by code limit 1`;
  for (const [code, unit] of ROWS)
    await sql`
      insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
      values (${tenant}, ${code}, ${GRADE}, 'Numeracy', ${unit}, ${`U106 objective ${code.slice(-2)}`}, 'Foundational', 'school', ${MATHS})
      on conflict (tenant_id, code) do update set unit = excluded.unit, retired = false`;
  await sql`
    insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
    values (${tenant}, 'LO-U106-O1', ${GRADE}, 'Other', 'U106 other unit', 'U106 objective of another subject', 'Foundational', 'school', ${other})
    on conflict (tenant_id, code) do update set retired = false`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${ACT}, ${GRADE}, 'Maths', 'U106 counting activity', 'A') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (${tenant}, ${ACT}, 'LO-U106-A1', 1, 'school') on conflict do nothing`;
});

test.afterAll(async () => {
  await sql`delete from activity_objective where tenant_id = ${tenant} and activity_code = ${ACT}`;
  await sql`update learning_objective set retired = true where tenant_id = ${tenant} and code like 'LO-U106-%'`;
  await sql.end();
});

const subjectRow = (page: Page, s: string) => page.locator(`[data-subject-row="${s}"]`);
const unitRow = (page: Page, u: string) => page.locator(`[data-unit-row="${u}"]`);

test("1. choosing Grade 2 then Maths shows Maths' units, each with its objectives count; none is empty", { tag: "@core" }, async ({ page }) => {
  await page.goto("/setup/curriculum");
  await page.locator(`[data-grade-tab="${GRADE}"]`).click();
  await expect(page.locator("[data-curriculum-tree]")).toHaveAttribute("data-grade", GRADE);
  await subjectRow(page, MATHS).locator("> a").click();
  await expect(page).toHaveURL(/grade=G2&subject=NUM/);
  const units = subjectRow(page, MATHS).locator("[data-unit-row]");
  expect(await units.count()).toBeGreaterThanOrEqual(3);
  for (const n of await units.locator('[data-count="objectives"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-n")))))
    expect(n).toBeGreaterThan(0);
  await expect(unitRow(page, "U106 unit A").locator('[data-count="objectives"]')).toHaveAttribute("data-n", "3");
  await expect(unitRow(page, "-")).toContainText("No unit yet");
});

test("2. a unit lists its objectives; one opens its panel, the address holds the path, and a reload keeps it", { tag: "@core" }, async ({ page }) => {
  await page.goto(`/setup/curriculum?grade=${GRADE}&subject=${MATHS}`);
  await unitRow(page, "U106 unit A").locator("> a").click();
  await expect(page.locator("[data-objective-leaf]")).toHaveCount(3);
  await page.locator('[data-objective-leaf="LO-U106-A1"]').click();
  const panel = page.locator('[data-panel="open"]');
  await expect(panel).toContainText("U106 objective A1");
  await panel.getByRole("tab", { name: "Activities" }).click();
  await expect(panel).toContainText("U106 counting activity");
  const url = new URL(page.url());
  expect(Object.fromEntries(["grade", "subject", "unit", "open"].map((k) => [k, url.searchParams.get(k)]))).toEqual({
    grade: GRADE,
    subject: MATHS,
    unit: "U106 unit A",
    open: "objective:LO-U106-A1",
  });
  await page.reload();
  await expect(page.locator('[data-panel="open"]')).toContainText("U106 objective A1");
  await expect(page.locator('[data-objective-leaf="LO-U106-A1"]')).toHaveAttribute("aria-current", "true");
});

test("3. opening a second subject closes the first", { tag: "@core" }, async ({ page }) => {
  await page.goto(`/setup/curriculum?grade=${GRADE}&subject=${MATHS}`);
  await expect(subjectRow(page, MATHS).locator("[data-unit-row]").first()).toBeVisible();
  await subjectRow(page, other).locator("> a").click();
  await expect(subjectRow(page, other).locator("[data-unit-row]").first()).toBeVisible();
  await expect(subjectRow(page, MATHS).locator("[data-unit-row]")).toHaveCount(0);
  await expect(page.locator('[data-subject-row] > a[aria-expanded="true"]')).toHaveCount(1);
});

test("4. every active objective of a grade is reachable: the subject rows add up to the grade's objectives", { tag: "@core" }, async ({ page }) => {
  await page.goto(`/setup/curriculum?grade=${GRADE}`);
  const shown = await page.locator('[data-subject-row] > a [data-count="objectives"]').evaluateAll((els) => els.reduce((t, e) => t + Number(e.getAttribute("data-n")), 0));
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from learning_objective where not retired and band = ${GRADE}`;
  expect(shown).toBe(n);
});

test("5. at 400 px the panel is a sheet over the page, and the page has no horizontal scroll", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(`/setup/curriculum?grade=${GRADE}&subject=${MATHS}&unit=${encodeURIComponent("U106 unit A")}&open=objective:LO-U106-A1`);
  const panel = page.locator('[data-panel="open"]');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((e) => getComputedStyle(e).position)).toBe("fixed");
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(800); // it rests on the foot of the screen
  expect(box.width).toBeLessThanOrEqual(400);
  await page.goto(`/setup/curriculum?grade=${GRADE}&subject=${MATHS}&unit=${encodeURIComponent("U106 unit A")}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
