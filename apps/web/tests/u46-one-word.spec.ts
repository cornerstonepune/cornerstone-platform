/**
 * U46 — One meaning per word (goals/ux8c-one-word.yaml). Nimish, 2026-10-21: "focus on the UI/UX first, on whatever we
 * have right now for math, making sure that every screen and every other representation is thought through well: it's
 * clear, it's accurate, clickability is fine."
 *
 * A Grade 2 class of the test's own, made once and kept (evidence is append-only): Asha has signed-off answers and no
 * parent report, so the reports page lists her. The educator teaches the class. Each test reads a page as a person does
 * and checks that the same thing is said one way.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass, aPerson, forgetPerson } from "./rows";
import { voiceSwitch } from "./k2-rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U46-MINE";
const EDUCATOR = { email: "u46-educator@cornerstone.test", name: "U46 Educator", role: "educator", classes: [SECTION] };
const PASSWORD = "u46-a-long-test-password";
let kids: Record<string, string>;

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from evidence_event where child_id = ${kids.Asha}`;
  if (!n) {
    const [skill] = await sql<{ code: string; rung: string }[]>`
      select ss.registry_codes[1] as code, ss.rung_code as rung from skill ss
      where ss.code = 'ADD.2D2D'`;
    for (const right of [true, true, true, false]) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel,
                                    observed_at, confirmed_by)
        values (${tenant}, ${kids.Asha}, ${skill.code}, ${skill.rung}, ${right}, '{}', 'item', now(), 'e2e')`;
    }
    await sql`select rebuild_child_skill_state(${kids.Asha}::uuid)`;
  }
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
});
test.afterAll(async () => {
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});

async function asEducator(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

test("Curriculum says taught one way: a grade's topic row is that grade's, and the one action has one name", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/setup/curriculum/skills?details=1");
  const table = page.getByRole("table", { name: "The curriculum, grade by grade" });
  // Multiplication is taught at Grade 1 (the panel above counts it taught); none of its Grade 2 skills is
  const row = table.locator('tr[data-row="G2/MUL"]');
  await expect(row).toContainText("not taught yet at this grade");
  await expect(row.getByRole("button", { name: `Say it is taught in ${SECTION}` })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("Mark taught");
  await page.context().close();
});

test("the parent reports page says what it lists: reports not up to date, never 'waiting on a person' for one no one has written", async ({ browser }) => {
  const page = await asEducator(browser);
  // the page is the Reports screen now (the old list folded into it, UI-8e); the title is kept, as a retired goal cites it by name
  await page.goto("/children/reports");
  const main = page.locator("main");
  await expect(main.locator("table").filter({ hasText: "Asha" }).first()).toBeVisible();
  await expect(main).not.toContainText(/waits? on a person/i);
  await page.context().close();
});

test("the question bank says what its total counts, beside Curriculum's", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/library");
  await expect(page.locator("main")).toContainText("ready, of the skills taught in your classes");
  await expect(page.locator("main")).toContainText("Curriculum counts every skill of the grade, taught or not");
  await page.context().close();
});

test("one word for one thing: a state by its own words, a skill as a skill, a count with its noun", async ({ browser }) => {
  const page = await asEducator(browser);
  // Children (UI-3b): the old list's "Needs help on" and "Against every skill →" are gone; the word rule stays
  await voiceSwitch(sql, true);
  await page.goto("/children");
  const main = page.locator("main");
  await expect(main).not.toContainText(/red skill|amber one/);
  await page.goto(`/growth/${kids.Asha}/report`);
  await expect(page.locator("main")).toContainText("on this map assessed");
  await expect(page.locator("main")).not.toContainText(/skill sets?\b/);
  await page.goto("/worksheets/taxonomy");
  await expect(page.locator("main")).toContainText("cases on worksheets");
  await expect(page.locator("main")).not.toContainText(/\b1 (questions|worksheets)\b/);
  await page.context().close();
});
