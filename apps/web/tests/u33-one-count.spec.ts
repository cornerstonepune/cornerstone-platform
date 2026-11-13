/**
 * U33 — one count for one thing (goals/ux2-one-count-one-thing.yaml). Nimish, 2026-10-15: "You really need to run a
 * thorough UI/UX skill here." The audit found the same number said three ways: "Grade 1 · G2-C" on a Grade 2 class's
 * papers, 12 class papers to approve on Today and 18 on Assessments, the bank 21,250, 28,705 and 28,717 on three pages,
 * the worksheet library 1,872 above its list and 2,738 in its pager. (That list page is retired: each skill's worksheets are
 * listed on its own skill set's page, and its count went with it.)
 *
 * A Grade 2 class of the test's own (tests/rows.ts) is given a Grade 1 worksheet as class practice: a copy for each of
 * its two children and one spare, as the engine prints a pack. Its papers and their week are taken away after.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass } from "./rows";
import { panel, workAt } from "./today-work";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const CLASS = "U33-CLASS";
const WEEK = "2026-W50";
let kids: Record<string, string> = {};

const qr = () => `CS${randomBytes(3).toString("hex").toUpperCase()}`;
const number = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

async function clearUp() {
  await sql`delete from prescription where week = to_date(${WEEK}, 'IYYY-"W"IW') and child_id in (select id from child_now where section = ${CLASS})`;
  await sql`delete from sheet_instance where section = ${CLASS} and week = to_date(${WEEK}, 'IYYY-"W"IW')`;
}

test.beforeAll(async () => {
  kids = await aClass(sql, CLASS, "G2", ["Asha", "Bilal"]);
  await clearUp();
  // a Grade 1 worksheet from the library, given to the Grade 2 class: its own grade is not the class's
  const [w] = await sql<{ id: string; tenant_id: string; skill_set_code: string; difficulty: string }[]>`
    select id, tenant_id, skill_set_code, difficulty from sheet_template
    where source = 'library' and retired_at is null and band = 'G1' order by code limit 1`;
  for (const id of Object.values(kids)) {
    const [{ id: copy }] = await sql<{ id: string }[]>`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status, section, week, kind)
      values (${w.tenant_id}, ${qr()}, ${w.id}, ${id}, 'new', ${CLASS}, to_date(${WEEK}, 'IYYY-"W"IW'), 'practice') returning id`;
    await sql`
      insert into prescription (tenant_id, child_id, week, rule_fired, skill_set_code, difficulty, kind, sheet_instance_id)
      values (${w.tenant_id}, ${id}, to_date(${WEEK}, 'IYYY-"W"IW'), 'band_default', ${w.skill_set_code}, ${w.difficulty}, 'practice', ${copy})`;
  }
  // the spare: the same worksheet, the class's, no child's
  await sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status, section, week, kind)
    values (${w.tenant_id}, ${qr()}, ${w.id}, null, 'new', ${CLASS}, to_date(${WEEK}, 'IYYY-"W"IW'), 'practice')`;
});
test.afterAll(async () => {
  await clearUp();
  await sql.end();
});

const ours = (page: Page) => page.getByRole("table").locator("tbody tr").filter({ hasText: CLASS });

test("the class papers Today counts are the copies the pages it opens show waiting", async ({ page }) => {
  await page.goto(workAt("classpaper", `&class=${CLASS}`));
  const item = panel(page).locator("tr[data-kind=classpaper]").filter({ hasText: `${CLASS} · class practice` });
  await expect(item).toContainText("2 papers");

  // Assessments: the two children's copies wait to be approved; the spare rides with them, counted apart
  await page.goto(`/children/assessments?class=${CLASS}&view=table`);
  // made, none yet printed: the next thing is to print them (a class's papers are approved as they are printed)
  await expect(ours(page)).toHaveCount(1);
  await expect(ours(page).locator('td[data-label="Waits for"]')).toHaveText(/Waits for print/);
  await expect(ours(page).locator("[data-assessment-next]")).toHaveText("Print");
  // the stage "Approved, to print" holds the class's one assessment
  await page.goto(`/children/assessments?class=${CLASS}&view=table&status=print`);
  await expect(page.locator('[data-filterbar] select[name="status"] option[value="print"]')).toHaveText("Approved, to print");
  await expect(ours(page), "the class's assessment waiting to be printed").toHaveCount(1);

  // the papers Today's line opens, and the assessment's own screen: two copies to approve, the spare among the spare
  // copies, the approval counting them as Today does (goals/ux5-papers-grouped.yaml)
  await page.goto(workAt("classpaper", `&class=${CLASS}`));
  // each link followed at its own address, the whole page waited for
  const line = panel(page).locator("tr[data-kind=classpaper]").filter({ hasText: `${CLASS} · class practice` }).getByRole("link");
  await expect(line).toHaveAttribute("href", new RegExp(`^/children/assessments\\?class=${CLASS}&`));
  await page.goto((await line.getAttribute("href"))!);
  // the card opens its panel on the board; its next action, Print, is the assessment's own screen (page charter B6)
  const card = page.locator("[data-lane] li").filter({ hasText: CLASS });
  await expect(card).toHaveCount(1);
  await expect(card.locator("[data-card-next]")).toHaveText("Print");
  await page.goto((await card.locator("[data-card-next]").getAttribute("href"))!);
  await expect(page.getByRole("region", { name: "Not printed yet, 2 copies" }).locator("tbody tr")).toHaveCount(2);
  const spares = page.getByRole("region", { name: "Spare copies" }).locator("tbody tr");
  await expect(spares).toHaveCount(1);
  await expect(spares).toContainText("To approve");
  const pack = page.getByRole("region", { name: "This pack" });
  await expect(pack).toContainText("This approves 2 papers and 1 spare, this pack only.");
  await expect(pack.getByRole("button", { name: "Approve the pack" })).toBeEnabled();
});

test("the question bank is one number wherever it is named", async ({ page }) => {
  // the questions the engine can draw: made by it, active, of a skill at one of that skill's levels
  const [{ bank, taught }] = await sql<{ bank: number; taught: number }[]>`
    select count(*)::int as bank,
           count(*) filter (where exists (select 1 from child_now k where k.tenant_id = s.tenant_id and k.active
                                          and skill_taught_in(s.tenant_id, s.code, k.section)))::int as taught
    from item i join skill s on s.tenant_id = i.tenant_id and s.code = i.skill_set_code
    where i.source = 'generated' and i.status = 'active' and s.difficulty ? i.difficulty`;
  const words = (n: number) => n.toLocaleString("en-IN");

  await page.goto("/setup/how-it-works");
  await expect(page.locator('[data-measure="N2"]')).toContainText(words(bank));

  await page.goto("/library");
  await expect(page.getByRole("main")).toContainText(`${words(taught)} questions ready to print`);
  await expect(page.getByRole("main"), "a part names the whole").toContainText(`of the bank's ${words(bank)}`);

  // Curriculum: its grades' questions are the bank's, each level counted at the grade that holds it
  await page.goto("/setup/curriculum/skills?details=1");
  const grades = page.getByRole("table", { name: "The curriculum, grade by grade" }).locator('tbody tr[data-depth="0"]');
  await expect(grades.first()).toBeVisible();
  const counts = await grades.locator("td:nth-child(2)").allInnerTexts();
  expect(counts.reduce((n, c) => n + number(c), 0), "Curriculum's grades add up to the bank").toBe(bank);
});
