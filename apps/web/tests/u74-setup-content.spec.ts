/**
 * U74 (UI-11) — the four Setup content screens: Curriculum, Skills to approve, the Question bank, one question. One test for
 * each Done-when line of specs/UI-11/spec.md that a browser can check; the first test of each screen is its goal (what it is
 * for, SPEC.md). Rows are the test's own, put back after.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { aTaughtClass } from "./rows";
import { clearOffers, code as k2code, curriculumRows, gate, offers } from "./m1-13-rows";
import { moreOffers } from "./inventory-setup-content";
import { TEST_STAFF } from "./global-setup";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let skills: string[] = [];
test.beforeAll(async () => {
  ({ skills } = await curriculumRows(sql));
  // the bank lists the questions of skills taught in a class: a fresh copy has none
  await aTaughtClass(sql);
});
test.afterAll(async () => {
  await gate(sql, "closed");
  await clearOffers(sql);
  await sql`delete from activity_skill where activity_code like 'ACT-K2-M113-%'`;
  await sql`delete from activity where code like 'ACT-K2-M113-%'`;
  await sql.end();
});

const waitingCount = async (page: Page) => Number(((await page.getByTestId("stage").textContent()) ?? "").match(/^(\d+) waiting$/)?.[1]);

/** Go to the next page of a table (its "Later →" link) and wait for the address to change; false when there is none. */
async function later(page: Page): Promise<boolean> {
  await page.locator("main [data-row]").first().waitFor(); // the page streams: its table arrives after the load event
  const link = page.getByRole("link", { name: /later/i }).first();
  if (!(await link.count())) return false;
  const was = page.url();
  const firstRow = () => page.locator("main [data-row]").first().getAttribute("data-row");
  const before = await firstRow();
  await link.click();
  await page.waitForURL((u) => u.href !== was);
  await expect.poll(firstRow).not.toBe(before); // the next page's rows have arrived
  return true;
}

/** Open Skills to approve on the page that holds `code`'s row. */
async function openRow(page: Page, code: string) {
  await page.goto("/setup/skills/approve");
  await page.locator("main [data-row]").first().waitFor();
  for (let i = 0; i < 40; i++) {
    if (await page.locator(`[data-row="${code}"]`).count()) return;
    if (!(await later(page))) break;
  }
}

test.describe("Skills to approve", () => {
  test("goal: read a waiting skill's levels and approve it on its own; the row leaves and the eyebrow drops by one", async ({ page }) => {
    // a skill waiting for approval, put back as it was
    const [was] = await sql<{ code: string; status: string; level_approved: object }[]>`select code, status, level_approved from skill where status = 'draft' order by code limit 1`;
    const code = was.code;
    const restore = async () => {
      await sql`update skill set status = ${was.status}, level_approved = ${sql.json(was.level_approved as never)} where code = ${code}`;
    };
    try {
      await openRow(page, code);
      const row = page.locator(`[data-row="${code}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(/Easy|Medium|Hard|Advance/); // its levels are read in the row
      const before = await waitingCount(page);
      await row.getByRole("button", { name: /^Approve/ }).click();
      await expect(page.locator(`[data-row="${code}"]`)).toHaveCount(0);
      expect(await waitingCount(page)).toBe(before - 1);
    } finally {
      await restore();
    }
  });

  test("approval is per row: every Approve button names one skill, and no control approves more", async ({ page }) => {
    await page.goto("/setup/skills/approve");
    // the one table of what a wrong answer counts against has its own button (tested below): it is not a skill's
    const buttons = page.locator("main button:not([data-approve-table])", { hasText: /approve/i });
    const n = await buttons.count();
    expect(n).toBeLessThanOrEqual(10);
    for (let i = 0; i < n; i++) await expect(buttons.nth(i)).toHaveAccessibleName(/^Approve .+/);
    await expect(page.getByRole("button", { name: /approve (all|every|these|the page)/i })).toHaveCount(0);
    await expect(page.locator("form", { has: page.locator("input[name=code]") }).first().locator("input[name=code]")).toHaveCount(1);
  });

  test("the eyebrow count equals the rows across all pages and is the only place the number is shown", async ({ page }) => {
    await page.goto("/setup/skills/approve");
    await page.locator("main [data-row]").first().waitFor();
    const n = await waitingCount(page);
    let rows = 0;
    for (let i = 0; i < 200; i++) {
      rows += await page.locator("[data-row]").count();
      if (!(await later(page))) break;
    }
    expect(rows).toBe(n);
    // nowhere else: not on the other pages of Setup, nor the bar
    for (const path of ["/setup/curriculum", "/setup/question-bank"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText(new RegExp(`\\b${n} (waiting|skills to approve|to approve)`, "i"));
    }
  });
});

test.describe("Curriculum", () => {
  test.beforeEach(async () => {
    await gate(sql, "reviewer");
  });

  test("goal: find an activity by a word of its name and open it to read it", async ({ page }) => {
    await page.goto("/setup/curriculum");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Curriculum");
    await page.getByRole("searchbox").fill("Placeholder activity 3");
    await page.getByRole("searchbox").press("Enter");
    const row = page.locator(`[data-activity-row]`).filter({ hasText: "Placeholder activity 3" }).first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/setup/activities/${k2code(3)}`));
  });

  test("one list carries activities (K2) and skills (grades 1–4) under one filter row", async ({ page }) => {
    await page.goto("/setup/curriculum");
    await expect(page.locator("[data-block=FilterBar]")).toHaveCount(1);
    await expect(page.locator("[data-block=DataTable] table").first()).toBeVisible();
    await page.getByRole("searchbox").fill("Placeholder activity 3");
    await page.getByRole("searchbox").press("Enter");
    await expect(page.locator("[data-activity-row]").first()).toBeVisible();
    const [skill] = await sql<{ name: string }[]>`select name from skill where grade <> (select value #>> '{}' from config where key = 'curriculum.screens_grade') order by code limit 1`;
    await page.goto(`/setup/curriculum?q=${encodeURIComponent(skill.name)}`);
    await expect(page.locator("[data-skill-row]").first()).toBeVisible();
    await expect(page.locator("[data-block=FilterBar]")).toHaveCount(1);
  });

  test("Curriculum shows no count of skills to approve; that number is the eyebrow of Skills to approve and appears nowhere else", async ({ page }) => {
    for (const path of ["/setup/curriculum", "/setup/question-bank"]) {
      await page.goto(path);
      await expect(page.locator("body"), path).not.toContainText(/\d+\s+(skills? to approve|waiting)\b/i);
    }
    await page.goto("/setup/skills/approve");
    await expect(page.getByTestId("stage")).toHaveText(/^\d+ waiting$/);
  });

  test("Yes / No act on one offer each; no control acts on all offers", async ({ page }) => {
    await offers(sql, skills);
    await page.goto("/setup/curriculum");
    const rows = page.locator("[data-offer]");
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole("button", { name: /\b(all|every|both)\b/i })).toHaveCount(0);
    await expect(page.locator("[data-offer-yes]")).toHaveCount(2);
    await expect(page.locator("[data-offer-no]")).toHaveCount(2);
    // Yes on the first links its skill; the other offer stays
    const first = rows.filter({ hasText: "The nearest examples did not carry it." });
    await first.locator("[data-offer-yes]").click();
    await expect(rows).toHaveCount(1);
    const linked = await sql<{ skill_code: string }[]>`select skill_code from activity_skill where activity_code = ${k2code(3)}`;
    expect(linked.map((l) => l.skill_code)).toContain(skills[1]);
    // No on the last closes it and links nothing
    await rows.first().locator("[data-offer-no]").click();
    await expect(rows).toHaveCount(0);
    const after = await sql<{ skill_code: string }[]>`select skill_code from activity_skill where activity_code = ${k2code(3)}`;
    expect(after.map((l) => l.skill_code)).not.toContain(skills[2]);
  });
});

test.describe("Curriculum: what the old pages did", () => {
  test.beforeEach(async () => {
    await gate(sql, "reviewer");
  });

  test("every offer is reachable: ten a page, then the rest on the next, and an answer keeps the page", async ({ page }) => {
    await offers(sql, skills);
    await moreOffers(sql, skills); // twelve in all
    await page.goto("/setup/curriculum");
    const rows = page.locator("[data-offer]");
    await expect(rows).toHaveCount(10);
    const pager = page.locator("nav[aria-label='Offers pages']");
    await pager.getByRole("link", { name: /later/i }).click();
    await expect(page).toHaveURL(/opage=2/);
    await expect(rows).toHaveCount(2);
    // answering one of the second page lands on the page still holding the other (the address keeps opage; it clamps when the page is gone)
    await rows.first().locator("[data-offer-no]").click();
    await expect(rows).toHaveCount(1);
    await clearOffers(sql);
  });
});

test.describe("Skills to approve: what the old page did", () => {
  test("a topic and 'taught or not' narrow the rows, and each choice says how many it leaves", async ({ page }) => {
    await page.goto("/setup/skills/approve");
    await page.locator("main [data-row]").first().waitFor();
    const all = await waitingCount(page);
    const topic = page.locator("select[name=topic]");
    const options = await topic.locator("option").allInnerTexts();
    const pick = options.find((o) => /\(\d+\)$/.test(o))!;
    const n = Number(pick.match(/\((\d+)\)$/)![1]);
    await topic.selectOption({ label: pick });
    await page.waitForURL(/topic=/);
    await page.locator("main [data-row]").first().waitFor();
    expect(n).toBeLessThanOrEqual(all);
    // the rows across the pages are that many
    let rows = 0;
    for (let i = 0; i < 50; i++) {
      rows += await page.locator("main [data-row]").count();
      if (!(await later(page))) break;
    }
    expect(rows).toBe(n);
    await page.goto("/setup/skills/approve?taught=no");
    await expect(page.locator("select[name=taught]")).toHaveValue("no");
  });

  test("the table of what a wrong answer counts against is approved on its own, in the coordinator's name, once", async ({ page }) => {
    await sql`update config set value = '{}'::jsonb where key = 'skills.charges_by_kind.approved'`;
    await page.goto("/setup/skills/approve");
    await page.getByRole("button", { name: /Approve this table as written/ }).click();
    await expect(page.getByText("What a wrong answer counts against is approved, in your name.")).toBeVisible();
    const [row] = await sql<{ by: string }[]>`select value ->> 'by' as by from config where key = 'skills.charges_by_kind.approved'`;
    expect(row.by).toBeTruthy();
    // approved, the button is gone
    await expect(page.getByRole("button", { name: /Approve this table as written/ })).toHaveCount(0);
  });
});

test.describe("Question bank", () => {
  test("goal: open a question from the bank and read it as it prints", async ({ page }) => {
    await page.goto("/setup/question-bank");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Question bank");
    await page.locator("[data-question-row]").first().click();
    await expect(page).toHaveURL(/\/setup\/question-bank\/[A-Za-z0-9._-]+$/);
    await expect(page.getByAltText("The question as it prints on a paper")).toBeVisible();
    await expect(page.getByText("Wrong answers it catches", { exact: true })).toBeVisible();
  });

  test("statistics and taxonomy sit behind the details link, not on the first view", async ({ page }) => {
    await page.goto("/setup/question-bank");
    const table = page.getByRole("table", { name: "Questions by grade and level" });
    await expect(table).toBeHidden();
    await page.getByText("Statistics (counts and worksheets by topic)").click();
    await expect(table).toBeVisible();
  });

  test("the table shows ten rows then pages", async ({ page }) => {
    await page.goto("/setup/question-bank");
    await expect(page.locator("[data-block=DataTable] [data-row]").first()).toBeVisible();
    expect(await page.locator("main table[aria-label=Questions] [data-row]").count()).toBe(10);
    const first = await page.locator("main table[aria-label=Questions] [data-row]").first().getAttribute("data-row");
    await page.locator("nav[aria-label='Questions pages']").getByRole("link", { name: /later/i }).click();
    await expect(page).toHaveURL(/page=2/);
    expect(await page.locator("main table[aria-label=Questions] [data-row]").count()).toBe(10);
    expect(await page.locator("main table[aria-label=Questions] [data-row]").first().getAttribute("data-row")).not.toBe(first);
  });
});

test.describe("the question as it prints", () => {
  const pick = async () =>
    (
      await sql<{ item_key: string; id: string; stem: string }[]>`
        select i.item_key, i.id, i.stem from item i join question_type q on q.fmt = i.fmt and q.own_words
        where i.source = 'generated' and i.status = 'active' and i.corrected_from is null order by i.created_at desc, i.item_key offset 7 limit 1`
    )[0];

  test("goal: correct a question's wording; the page shows the new wording", async ({ page }) => {
    const it = await pick();
    await page.goto(`/setup/question-bank/${it.item_key}`);
    await page.getByLabel("The wording (required)").fill(`${it.stem} Read it twice.`);
    await page.getByLabel("What was wrong (required)").fill("the wording was unclear");
    await page.getByRole("button", { name: "Correct the wording" }).click();
    await expect(page.getByText("Saved. This is the corrected question")).toBeVisible();
    // the corrected question is the live one: its wording field holds the new wording
    await expect(page.getByLabel("The wording (required)")).toHaveValue(new RegExp("Read it twice\\.$"));
  });

  test("a correction keeps the old key and the old version readable", async ({ page }) => {
    const it = await pick();
    await page.goto(`/setup/question-bank/${it.item_key}`);
    await page.getByLabel("The wording (required)").fill(`${it.stem} Take your time.`);
    await page.getByLabel("What was wrong (required)").fill("the wording was unclear");
    await page.getByRole("button", { name: "Correct the wording" }).click();
    await expect(page.getByText("Saved. This is the corrected question")).toBeVisible();
    const [fresh] = await sql<{ item_key: string; from_key: string }[]>`
      select n.item_key, o.item_key as from_key from item n join item o on o.id = n.corrected_from where o.id = ${it.id}`;
    expect(fresh.from_key).toBe(it.item_key);
    // the old key still answers, as removed, and says where the corrected one is
    await page.goto(`/setup/question-bank/${it.item_key}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-removed]")).toContainText(fresh.item_key);
  });

  test("Remove retires, never deletes", async ({ page }) => {
    const it = await pick();
    const [{ n: before }] = await sql<{ n: number }[]>`select count(*)::int as n from item`;
    await page.goto(`/setup/question-bank/${it.item_key}`);
    // a reason is required: an empty one submits nothing
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("[data-question-state=ready]")).toBeVisible();
    await page.getByLabel("Reason for removal (required)").fill("two answers are right");
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("[data-question-state=removed]")).toBeVisible();
    const [{ n: after }] = await sql<{ n: number }[]>`select count(*)::int as n from item`;
    expect(after).toBe(before);
    const [row] = await sql<{ status: string }[]>`select status from item where id = ${it.id}`;
    expect(row.status).toBe("retired");
  });
});

test.describe("Curriculum: questions to answer", () => {
  const CODES = ["MD.A2", "MD.A3"];
  const reset = () => sql`update ask set answer = null, correction = null, answered_by = null, answered_at = null where code = any(${CODES})`;
  test.beforeEach(reset);
  test.afterEach(reset);

  test("a question drafted for a person is agreed or corrected in their own words, in the name of who answers", async ({ page }) => {
    const asked = await sql<{ code: string; question: string }[]>`select code, question from ask where code = any(${CODES}) order by code`;
    expect(asked.map((a) => a.code)).toEqual(CODES);
    const [{ n: before }] = await sql<{ n: number }[]>`select count(*)::int as n from ask where answer is null`;
    const row = (q: string) => page.locator("main [data-ask]").filter({ hasText: q });
    // they are among the questions waiting, ten a page: the page that holds one is found by paging (the table streams in after the load event)
    const find = async (q: string) => {
      for (let p = 1; p <= 3; p++) {
        await page.goto(`/setup/curriculum?apage=${p}#asks`);
        await page.locator("main [data-ask]").first().waitFor();
        if (await row(q).count()) return row(q);
      }
      throw new Error(`no question “${q}” among those waiting`);
    };
    const name = (verb: string, code: string) => `${verb} (${code}), as ${TEST_STAFF.name}`;
    await (await find(asked[0].question)).getByRole("button", { name: name("Agree as drafted", asked[0].code) }).click();
    await expect(page.locator("main [data-ask]").filter({ hasText: asked[0].question })).toHaveCount(0);
    // an empty correction is refused with a word, and answers nothing
    await (await find(asked[1].question)).getByRole("button", { name: name("Correct it", asked[1].code) }).click();
    await expect(page.getByRole("status").filter({ hasText: "A correction needs its words" })).toBeVisible();
    const mine = await find(asked[1].question);
    await mine.getByLabel("What it should say").fill("A remainder is written in words first, then with r from Grade 3");
    await mine.getByRole("button", { name: name("Correct it", asked[1].code) }).click();
    await page.getByText(/^Read the \d+ answered$/).click();
    const answered = page.locator("[data-asks]");
    await expect(answered).toContainText(asked[0].question);
    await expect(answered).toContainText("A remainder is written in words first, then with r from Grade 3");
    const rows = await sql<{ code: string; answer: string; correction: string | null; answered_by: string }[]>`
      select code, answer, correction, answered_by from ask where code = any(${CODES}) order by code`;
    expect(rows).toEqual([
      { code: "MD.A2", answer: "agreed", correction: null, answered_by: TEST_STAFF.name },
      { code: "MD.A3", answer: "corrected", correction: "A remainder is written in words first, then with r from Grade 3", answered_by: TEST_STAFF.name },
    ]);
    const [{ n: after }] = await sql<{ n: number }[]>`select count(*)::int as n from ask where answer is null`;
    expect(after).toBe(before - 2);
  });
});
