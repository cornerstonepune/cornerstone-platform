/**
 * U75 (UI-3f) — what the old list of children showed, carried onto the Children screens: the skill a child most needs help on
 * (a column, by name only), a class's whole counts of answers and parent reports waiting (no scores, no ranks, none per child),
 * and "Against every skill" on the child's page. Fake names only.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aClass, aReadPaper } from "./rows";
import { voiceSwitch } from "./k2-rows";

const SECTION = "U75A";
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let classId = "";
let kids: Record<string, string> = {};

test.beforeAll(async () => {
  await voiceSwitch(sql, true);
  kids = await aClass(sql, SECTION, "G2", ["Ishaan", "Meera"]);
  [{ id: classId }] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from evidence_event where child_id = ${kids.Ishaan}`;
  if (!n) {
    for (const right of [false, false, false, false, true, true]) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel, observed_at, confirmed_by)
        values (${tenant}, ${kids.Ishaan}, 'NUM.OPS.02', 'R24', ${right}, ${right ? [] : ["M_SMALL_FROM_LARGE"]}, 'item', now(), 'u75')`;
    }
    await sql`select rebuild_child_skill_state(${kids.Ishaan}::uuid)`;
  }
  // Meera's paper is read and the reader could not judge it: three answers wait for a person
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template where source = 'library' and retired_at is null and cardinality(item_ids) >= 3 order by code limit 1`;
  const paper = await aReadPaper(sql, { qr: "CS750A01", child: kids.Meera, template: ws.id, items: ws.item_ids.slice(0, 3), reads: [{ status: "correct", read: "8" }, { status: "correct", read: "9" }, { status: "correct", read: "4" }] });
  await sql`update item_result set status = 'needs_teacher' where id = any(${paper.results}::uuid[])`;
});
test.afterAll(async () => sql.end());
test.use({ viewport: { width: 1440, height: 900 } });

test("a child's row says the skill they most need help on, by name only", async ({ page }) => {
  await page.goto(`/children?cls=${classId}`);
  const table = page.getByRole("main").locator('table[aria-label^="Children"]');
  await expect(table.getByRole("columnheader", { name: "Needs help on" })).toBeVisible();
  const row = table.locator(`tr[data-child="${kids.Ishaan}"]`);
  const help = await row.locator("td").nth((await table.locator("thead th").allTextContents()).findIndex((h) => /Needs help on/.test(h))).innerText();
  expect(help.trim().length).toBeGreaterThan(1);
  // the name of the skill only: not the mistake they repeat on it
  const [{ name: mistake }] = await sql<{ name: string }[]>`select mistake_name('M_SMALL_FROM_LARGE', 'NUM.OPS.02') as name`;
  expect(help).not.toContain(mistake.slice(0, 20));
  expect(help).not.toMatch(/\bM_|%/);
  // a child with nothing to help on has an empty cell, not a dash
  const meera = await table.locator(`tr[data-child="${kids.Meera}"] td`).allInnerTexts();
  expect(meera).not.toContain("—");
});

test("a class's header says how many answers and parent reports wait, as whole counts", async ({ page }) => {
  await page.goto(`/children?cls=${classId}`);
  const line = page.locator(`[data-class-counts="${SECTION}"]`);
  await expect(line).toContainText("3 answers waiting");
  await expect(line).toContainText(/parent reports? waiting/);
  await expect(line).not.toContainText(/%|rank|score/i);
  // no parent report waits in this class, so the count is words and not a link to Reports
  await expect(line.getByRole("link", { name: /parent report/ })).toHaveCount(0);
  await page.goto(`/children/${classId}`);
  await expect(page.locator("[data-class-counts]").first()).toContainText("3 answers waiting");
});

test("the child's page links to the class against every skill", async ({ page }) => {
  const [c] = await sql<{ roll_no: string }[]>`select roll_no from child_now where id = ${kids.Ishaan}`;
  await page.goto(`/children/${classId}/${c.roll_no}`);
  await page.getByRole("link", { name: "Against every skill →" }).click();
  await expect(page).toHaveURL(new RegExp(`/children/${classId}\\?view=matrix$`));
});
