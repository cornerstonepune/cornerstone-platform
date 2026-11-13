/**
 * NY1 — what waits on a person (goals/ny1-needs-you.yaml). Nimish, 2026-10-10: "I'm not even now able to figure out
 * what all papers I need to validate or for Achal to validate … I'm not seeing any of the multiplication, division".
 * Today lists every one of those things under the tab where it is done, shown to everyone signed in — the school's two
 * educators are its only layer (goals/ui1-menu-and-today.yaml); Curriculum switches a topic on in a person's name; a
 * skill is approved before its topic is on; a question the engine drafted for Achal is answered on the site. Every
 * change is put back after.
 */
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_STAFF } from "./global-setup";
import { aClass } from "./rows";
import { GROUP_OF, panel, rowCount, workAt } from "./today-work";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const CLASS = "U13-CLASS";

test.afterAll(async () => {
  await sql.end();
});

/** What the rows of one kind on What needs doing add up to: the "How many" of each (answers, questions, classes), or, for
 *  `rows`, how many rows there are (a topic's own rows are counted in its summary, which the table's first ten do not cap). */
async function todo(page: Page, kind: string, by: "many" | "rows" = "many"): Promise<number> {
  await page.goto(workAt(kind));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
  // the group's own count on its row (a table shows ten rows a page)
  if (by === "rows") return rowCount(page, GROUP_OF[kind]);
  const many = await panel(page).locator(`tr[data-kind=${kind}] td[data-label="How many"]`).allInnerTexts();
  return many.reduce((n, m) => n + Number(m.replace(/\D/g, "")), 0);
}

test("Today lists what waits on a person, under the tab where it is done, hidden from no one", async ({ page }) => {
  // a class of the test's own, so a topic is waiting to be taught whichever spec ran before this one (a shard may start with it)
  await aClass(sql, CLASS, "G3", ["Mehr", "Neel"]);
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
  // the school's two educators are its only layer: no row is filed under someone else's name
  await expect(page.getByText(/For others|For you|No one on the staff list/)).toHaveCount(0);
  // the topics a class has not been taught, one green row each ("when ready"), and a button in its row
  const [{ off }] = await sql<{ off: number }[]>`select count(*)::int as off from topic t where exists (select 1 from child_now k where k.tenant_id = t.tenant_id and k.active and not taught_in(t.tenant_id, t.code, k.section))`;
  expect(await todo(page, "taught", "rows")).toBe(off);
  // every question the engine drafted, still waiting, whoever it was drafted for
  const [{ open }] = await sql<{ open: number }[]>`select count(*)::int as open from ask where answer is null`;
  expect(open, "the engine has drafted questions to answer").toBeGreaterThan(0);
  expect(await todo(page, "ask")).toBe(open);
  // a topic is marked taught in its own row; its group's heading opens Curriculum
  await page.goto(workAt("taught"));
  await expect(panel(page).locator("tr[data-kind=taught]").first().getByRole("button", { name: "Mark as taught" })).toBeVisible();
  await expect(panel(page).locator("a[data-panel-full]")).toHaveAttribute("href", "/");
});

test("an educator switches a topic on, in their name, and its skills are on Curriculum and the Question bank", async ({ page }) => {
  // switched on for one class, as a topic is now (goals/f1f-taught-per-class.yaml): the test's own class
  await aClass(sql, CLASS, "G3", ["Mehr", "Neel"]);
  const [topic] = await sql<{ name: string; taught: boolean }[]>`select name, taught_in(tenant_id, code, null) as taught from topic where code = 'DIV'`;
  expect(topic.taught, "division waits for an educator's word").toBe(false);
  const said = () => sql`select bool_and(taught) as taught, min(taught_by) as taught_by from (select sc.tenant_id, sc.label as section, w.key as skill_set_code, (w.value ->> 'taught')::boolean as taught, w.value ->> 'by' as taught_by from school_class sc cross join jsonb_each(sc.taught) w) class_skill where section = ${CLASS} and skill_set_code in (select code from skill where topic_code = 'DIV')`;
  try {
    await page.goto(workAt("taught", `&subject=NUM&class=${CLASS}`));
    const row = panel(page).locator(`tr[data-kind=taught][data-shows="${topic.name}"]`);
    await expect(row).toContainText(topic.name);
    // with one class on the roll there is no choice to make, and so no box
    if (await row.getByLabel(`Class taught ${topic.name}`).count()) await row.getByLabel(`Class taught ${topic.name}`).selectOption(CLASS);
    await row.getByRole("button", { name: "Mark as taught" }).click();
    await expect(page.getByRole("main")).toContainText(`${topic.name} is taught in ${CLASS} now`);
    expect(await said()).toEqual([{ taught: true, taught_by: TEST_STAFF.name }]);
    // its skills are taught in a class now: on the Question bank, with their questions
    await page.goto("/library?set=DIV.2D1D");
    await expect(page.getByRole("main")).toContainText("2-digit ÷ 1-digit");
  } finally {
    await sql`update school_class set taught = '{}' where label = ${CLASS}`;
  }
});

test("a skill is approved before its topic is switched on", async ({ page }) => {
  const [before] = await sql<{ status: string; ratified_by: string | null }[]>`
    select status, ratified_by from skill where code = 'DIV.2D1D'`;
  try {
    await sql`update skill set status = 'draft', ratified_by = null where code = 'DIV.2D1D'`;
    // Skills to approve, its Taught filter on "Not taught yet": the skill is among them (ten rows a page: under its topic)
    await page.goto("/setup/skills/approve?taught=no&topic=DIV");
    await expect(page.locator('tr[data-row="DIV.2D1D"]')).toBeVisible();
    // the screen's eyebrow counts every skill waiting (its table shows ten a page)
    // (the eyebrow over the title, not the bar's own "n waiting" beside Today)
    const waiting = Number(((await page.getByTestId("stage").textContent()) ?? "").trim().match(/^(\d+) waiting$/)?.[1]);
    expect(await todo(page, "skill", "rows")).toBe(waiting);
    // approved from its own page, as written, in the approver's name
    await page.goto("/setup/skill-sets/DIV.2D1D");
    await expect(page.getByRole("main")).toContainText("Not taught yet");
    await page.getByRole("button", { name: /^Approve, as / }).click();
    await expect(page.getByRole("main")).toContainText(/Approved/);
    const [after] = await sql<{ status: string; ratified_by: string | null }[]>`
      select status, ratified_by from skill where code = 'DIV.2D1D'`;
    expect(after).toEqual({ status: "ratified", ratified_by: TEST_STAFF.name });
  } finally {
    await sql`update skill set status = ${before.status}, ratified_by = ${before.ratified_by} where code = 'DIV.2D1D'`;
  }
});

test("a question drafted for Achal is agreed or corrected on the site, in the name of who answers", async ({ page }) => {
  const asked = await sql<{ code: string; question: string }[]>`
    select code, question from ask where code in ('MD.A2', 'MD.A3') and answer is null order by code`;
  expect(asked.map((a) => a.code)).toEqual(["MD.A2", "MD.A3"]);
  const [{ n: before }] = await sql<{ n: number }[]>`select count(*)::int as n from ask where answer is null`;
  // the questions to answer are a section of Curriculum, ten a page: the page that holds one is found by paging
  const row = (q: string) => page.locator("main [data-ask]").filter({ hasText: q });
  const find = async (q: string) => {
    for (let p = 1; p <= 3; p++) {
      await page.goto(`/setup/curriculum?apage=${p}#asks`);
      await page.locator("main [data-ask]").first().waitFor();
      if (await row(q).count()) return row(q);
    }
    throw new Error(`no question “${q}” among those waiting`);
  };
  try {
    await (await find(asked[0].question)).getByRole("button", { name: `Agree as drafted (${asked[0].code}), as ${TEST_STAFF.name}` }).click();
    await expect(row(asked[0].question)).toHaveCount(0);
    const a3 = await find(asked[1].question);
    await a3.getByLabel("What it should say").fill("A remainder is written in words first, then with r from Grade 3");
    await a3.getByRole("button", { name: `Correct it (${asked[1].code}), as ${TEST_STAFF.name}` }).click();
    await expect(row(asked[1].question)).toHaveCount(0);
    const answered = page.locator("[data-asks] details[data-fold=answered-asks]");
    await expect(answered).toContainText(asked[0].question);
    await expect(answered).toContainText("A remainder is written in words first, then with r from Grade 3");
    const rows = await sql<{ code: string; answer: string; correction: string | null; answered_by: string }[]>`
      select code, answer, correction, answered_by from ask where code in ('MD.A2', 'MD.A3') order by code`;
    expect(rows).toEqual([
      { code: "MD.A2", answer: "agreed", correction: null, answered_by: TEST_STAFF.name },
      { code: "MD.A3", answer: "corrected", correction: "A remainder is written in words first, then with r from Grade 3", answered_by: TEST_STAFF.name },
    ]);
    expect(await todo(page, "ask")).toBe(before - 2);
  } finally {
    await sql`update ask set answer = null, correction = null, answered_by = null, answered_at = null where code in ('MD.A2', 'MD.A3')`;
  }
});
