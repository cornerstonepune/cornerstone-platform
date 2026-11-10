/**
 * U73 (UI-3c) — A child's checked answers, read only, on the child's page ("Answers"). The old child screen's answers table,
 * moved: date, question, what the child wrote, the mark, working shown, the mistake matched, the skill. Fake names only.
 * One child of the test's own class has one paper signed off: one right, one wrong with working, one blank (three signals apart).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { sessionFor } from "./inventory-fixtures";
import { aClass, aPerson, aReadPaper, personAsStored } from "./rows";
import { voiceSwitch } from "./k2-rows";

const SECTION = "U73A";
const EDUCATOR = { email: "u73-educator@cornerstone.test", name: "Asha Almond", role: "educator", classes: [SECTION], subjects: ["NUM"] };
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let classId = "";
let child = "";

test.beforeAll(async () => {
  await voiceSwitch(sql, true);
  const kids = await aClass(sql, SECTION, "K2", ["Ishaan"]);
  child = kids.Ishaan;
  [{ id: classId }] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template where source = 'library' and retired_at is null and cardinality(item_ids) >= 3 order by code limit 1`;
  const paper = await aReadPaper(sql, {
    qr: "CS730A01",
    child,
    template: ws.id,
    items: ws.item_ids.slice(0, 3),
    reads: [{ status: "correct", read: "8" }, { status: "wrong", read: "5", checkedBy: "u73" }, { status: "blank", checkedBy: "u73" }],
  });
  // the second answer: the child showed working that was not enough
  await sql`update item_result set raw_read = (raw_read::jsonb || ${sql.json({ working_summary: "counted on fingers", slot: "2" })})::text where id = ${paper.results[1]}`;
  await sql`select confirm_results(${child}::uuid, 'u73', ${paper.capture}::uuid)`;
});
test.afterAll(async () => {
  await sql.end();
});

test("the child's page lists each signed-off answer once, with the three signals told apart", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.goto(`/children/${classId}/1`);
  const [{ n }] = await sql<{ n: number }[]>`
    select count(distinct e.item_result_id)::int as n from evidence_event e join item_result r on r.id = e.item_result_id
    join capture c on c.id = r.capture_id where e.child_id = ${child} and e.confirmed_by is not null and c.superseded_by is null`;
  expect(n).toBe(3);
  await expect(page.getByRole("heading", { name: "Answers" })).toBeVisible();
  const rows = page.locator('table[aria-label="Answers signed off, newest first"] tbody tr');
  await expect(rows).toHaveCount(n);
  const marks = (await rows.locator("[data-block=Pill], .pill, td:nth-child(4)").allInnerTexts()).join("|");
  expect(marks).toMatch(/right/);
  expect(marks).toMatch(/wrong · with working/);
  expect(marks).toMatch(/blank/);
  await expect(page.getByRole("table", { name: "Answers signed off, newest first" })).not.toContainText("incorrect");
  await context.close();
});
