/**
 * U79 (UI-4b, PR 3) — checking by assessment, where an educator now does it: the Assessments list says what waits in each assessment, the assessment
 * lists its papers in roll order, and finishing a paper offers the next paper of the same assessment (old spec: asm2-checking, goals/asm2_by_topic_and_checking.yaml;
 * Nimish, 26 Oct 2026: "everyone checks the assessment by the last upload that they do").
 *
 * Two assessments of a class of the test's own: Alpha (two children's papers, 3 answers waiting, in five days ago) and Beta
 * (one paper, a wrong and a blank held for a person, in yesterday); no answer the engine was sure of, so no spot-check.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { openPaper } from "./paper-screen";
import { aClass, aReadPaper, aWorksheet } from "./rows";

test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U79-CHK";
const HELD = {
  wrong: "read as a wrong answer; a person checks every wrong answer before it counts",
  blank: "read as blank; a person checks every blank before it counts",
};
let alpha: { asha: string[]; bina: string[] };
let beta: string[];

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan"]);
  const sums = ["46 + 38", "57 + 28", "68 + 27"];
  const sheet = (code: string, title: string) =>
    aWorksheet(sql, {
      code,
      title,
      date: "2026-10-20",
      band: "G2",
      week: `${code}-WEEK`,
      items: sums.map((expr, i) => ({ n: i + 1, page: 1, expr, question: expr })),
    });
  const [a, b] = [await sheet("U79-A", "U79 Alpha"), await sheet("U79-B", "U79 Beta")];
  const wait = (read: string) => ({ status: "needs_teacher", read, why: "the reader was not sure", guess: read });
  const asha = await aReadPaper(sql, { qr: "CSU79C01", child: kids.Asha, template: a.template, items: a.items, reads: [wait("84"), wait("85")] });
  const bina = await aReadPaper(sql, { qr: "CSU79C02", child: kids.Bina, template: a.template, items: a.items, reads: [wait("84")] });
  const chetan = await aReadPaper(sql, {
    qr: "CSU79C03",
    child: kids.Chetan,
    template: b.template,
    items: b.items,
    reads: [
      { status: "needs_teacher", read: "73", why: HELD.wrong, guess: "73" },
      { status: "needs_teacher", why: HELD.blank },
    ],
  });
  alpha = { asha: asha.results, bina: bina.results };
  beta = chetan.results;
  await sql`update capture set created_at = now() - interval '5 days' where id in (${asha.capture}, ${bina.capture})`;
  await sql`update capture set created_at = now() - interval '1 day' where id = ${chetan.capture}`;
});
test.afterAll(async () => sql.end());


const paper = (page: Page) => page.getByRole("region", { name: "Say what the child wrote" });

test("the list says, for each assessment of the class, how many answers wait for a person", async ({ page }) => {
  await page.goto(`/children/assessments?class=${SECTION}&view=table`);
  const rows = page.locator("tr[data-assessment]");
  await expect(rows).toHaveCount(2);
  const alpha = rows.filter({ hasText: "U79 Alpha" });
  const beta = rows.filter({ hasText: "U79 Beta" });
  await expect(alpha).toContainText("3 answers to judge");
  await expect(beta).toContainText("2 answers to judge");
});

test("an assessment opens into its papers in roll order, and finishing a paper offers the next paper of the same assessment", async ({ page }) => {
  await page.goto(`/children/assessments?class=${SECTION}&view=table`);
  await page.locator("tr[data-assessment]", { hasText: "U79 Alpha" }).locator("a[data-assessment-row]").click();
  const copies = page.getByRole("table").filter({ hasText: "Answers to judge" });
  await expect(copies.getByRole("row", { name: /^1 / })).toContainText("Check this paper");
  await expect(copies.getByRole("row", { name: /^2 / })).toContainText("Check this paper");
  await openPaper(page, SECTION, "1", "U79-A-WEEK");
  // Asha's two answers, one after the other
  for (let i = 0; i < 2; i++) {
    await paper(page).getByRole("button", { name: /^Yes, the child wrote / }).click();
    await expect.poll(async () => (await sql`select count(*)::int as n from item_result where id = any(${alpha.asha}) and status = 'needs_teacher'`)[0].n).toBe(1 - i);
  }
  // her paper is done, and the next paper to check is Bina's, of the same assessment
  await page.goto(page.url());
  const next = page.getByRole("complementary", { name: "Rail" }).getByRole("link", { name: /The next paper to check/ });
  await expect(next).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Check the answers" })).toBeVisible();
  await expect(page.getByText("Sr. No. 2")).toBeVisible();
});

test("the three signals stay three on the paper: a wrong and a blank the engine held are said apart", async ({ page }) => {
  await page.goto(`/capture/check?id=${beta[0]}`);
  await expect(paper(page).getByText(/a wrong answer\. Every wrong answer is checked by a person before it counts\./)).toBeVisible();
  await page.goto(`/capture/check?id=${beta[1]}`);
  await expect(paper(page).getByText("The reader found nothing written here. Every blank is checked by a person before it counts.")).toBeVisible();
  await expect(paper(page).getByRole("button", { name: "Blank (the child wrote nothing)" })).toBeVisible();
});
