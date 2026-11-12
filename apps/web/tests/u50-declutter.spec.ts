/**
 * U50 — the educator's pages, decluttered (goals/ux10-declutter.yaml). Nimish, 2026-10-22, on the live site: "Look at
 * the clutter"; "The current frontend is extremely confusing to me ... make it much, much cleaner."
 *
 * An educator of two Grade 2 classes of the test's own, made once and kept (evidence is append-only):
 * - U50-BUSY: Asha, who needs help (four wrong answers taking the smaller digit from the larger, two right) and has two
 *   answers waiting for a person; Bina, with nothing yet;
 * - U50-QUIET: Cara and Dev, with nothing yet — so nothing in their table has a number to show.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass, aReadPaper, aPerson, forgetPerson } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const BUSY = "U50-BUSY";
const QUIET = "U50-QUIET";
const EDUCATOR = { email: "u50-educator@cornerstone.test", name: "U50 Educator", role: "educator", classes: [BUSY, QUIET] };
const PASSWORD = "u50-a-long-test-password";
let kids: Record<string, string> = {};
let busy = ""; // U50-BUSY's id: the class picture of the educator's first class is /children/<id>?view=topic

test.beforeAll(async () => {
  kids = await aClass(sql, BUSY, "G2", ["Asha", "Bina"]);
  [{ id: busy }] = await sql<{ id: string }[]>`select id from school_class where label = ${BUSY} limit 1`;
  await aClass(sql, QUIET, "G2", ["Cara", "Dev"]);
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from evidence_event where child_id = ${kids.Asha}`;
  if (!n) {
    const answers: boolean[] = [false, false, false, false, true, true];
    for (const right of answers) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel,
                                    observed_at, confirmed_by)
        values (${tenant}, ${kids.Asha}, 'NUM.OPS.02', 'R24', ${right}, ${right ? [] : ["M_SMALL_FROM_LARGE"]}, 'item',
                now(), 'u50')`;
    }
    await sql`select rebuild_child_skill_state(${kids.Asha}::uuid)`;
  }
  const [w] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template where source = 'library' and retired_at is null and band = 'G2'
    order by code limit 1`;
  await aReadPaper(sql, {
    qr: "U50-ASHA",
    child: kids.Asha,
    template: w.id,
    items: w.item_ids.slice(0, 3),
    reads: [{ status: "needs_teacher", read: "41" }, { status: "needs_teacher", read: "7" }, { status: "correct", read: "12" }],
  });
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
});
test.afterAll(async () => {
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});

async function asEducator(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}


// Children (UI-3b) keeps the rule: no topic chips on the list, every class or one.
test("Children has no topic chips, with a class chosen too", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/children");
  await expect(page.getByRole("navigation", { name: "Topic" })).toHaveCount(0);
  await page.goto(`/children?cls=${busy}`);
  await expect(page.getByRole("navigation", { name: "Topic" })).toHaveCount(0);
  await page.context().close();
});

test("in the menu only Today carries a count", async ({ browser }) => {
  const page = await asEducator(browser);
  for (const path of ["/setup/needs-doing", "/", `/children/${busy}?view=topic`]) {
    await page.goto(path);
    const menu = page.getByRole("navigation", { name: "Sections" });
    // Asha's waiting answers make Assessments and Today non-zero, so a count elsewhere would show
    for (const link of await menu.getByRole("link").all()) {
      if (/^Today\b/.test((await link.innerText()).trim())) continue;
      await expect(link.getByTestId("waiting"), `${await link.innerText()} on ${path}`).toHaveCount(0);
    }
    expect(await menu.getByTestId("waiting").count()).toBeLessThanOrEqual(1);
  }
  await page.context().close();
});

test("Curriculum shows each skill in a row with its levels and status; the bank's counts wait behind Question bank details", async ({
  browser,
}) => {
  const page = await asEducator(browser);
  await page.goto("/");
  const table = page.getByRole("table", { name: "The curriculum" });
  // grade, subject, topic, skill, the school's levels and one status: aligned columns, never a tree to open
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Open everything" }),
  ).toHaveCount(0);
  await expect(
    table.locator("tbody tr").first().locator("td").nth(4),
  ).toContainText(/^(Easy|Medium|Hard|Advance)/);
  // none of the bank's counts, nor its other doors, nor the word the team uses for its map
  const main = page.getByRole("main");
  for (const word of [
    "Questions",
    "Worksheets",
    "Children assessed",
    "taxonomy",
    "Every question in the bank",
  ]) {
    // a bank label is a whole label; a skill's own sentence may hold the word
    const label = ["Questions", "Worksheets", "Children assessed"].includes(word);
    await expect(main.getByText(word, { exact: label }), word).toHaveCount(0);
  }
  // one link puts them there
  await page.getByRole("link", { name: "Question bank details" }).click();
  await expect(page).toHaveURL(/details=1/);
  const counts = page.getByRole("table", {
    name: "The curriculum, grade by grade",
  });
  await expect(
    counts.getByRole("columnheader", { name: "Questions" }),
  ).toBeVisible();
  await expect(
    counts.getByRole("columnheader", { name: "Worksheets" }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Every question in the bank" }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Every case, with its worksheets" }),
  ).toBeVisible();
  // a topic not taught yet is a word on its row, and the two big sections are gone
  await expect(
    page.getByRole("region", { name: "Not taught yet" }),
  ).toBeHidden();
  await page.context().close();
});

test("under a page's title there is one line, never a paragraph", async ({ browser }) => {
  const page = await asEducator(browser);
  for (const path of ["/setup/needs-doing", "/", `/children/${busy}?view=topic`]) {
    await page.goto(path);
    const sub = page.locator("header p");
    expect(await sub.count(), `${path}: at most one line under the title`).toBeLessThanOrEqual(1);
    for (const t of await sub.allInnerTexts()) expect(t.length, `${path}: ${t}`).toBeLessThanOrEqual(140);
    // and no paragraph anywhere on the two decluttered pages is a paragraph of explanation
    if (path !== "/setup/needs-doing") {
      for (const p of await page.getByRole("main").locator("p:visible").all()) {
        expect((await p.innerText()).length, `${path} has a paragraph over 140 characters`).toBeLessThanOrEqual(140);
      }
    }
  }
  await page.context().close();
});
