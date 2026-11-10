/**
 * U75 (UI-4b, PR 1) — what the old Assessments page did that the new list now does, carried across with the same assertions
 * (the old spec names are in docs/notes/UI-4b.md): the By topic view (asm2-by-topic) and a name an educator gives an assessment (u63),
 * from its row in the table and from the assessment's own screen. A class of the test's own: twelve class assessments on one
 * Addition & subtraction skill, a different week each, and two on Multiplication, so a topic has more than a page of rows and
 * another topic's rows can be told apart.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { assessmentHref } from "../lib/assessment-ui";
import { aClass } from "./rows";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U75-CLASS";
const RUN = randomBytes(2).toString("hex").toUpperCase();
const WEEKS = Array.from({ length: 12 }, (_, i) => `2025-W${String(10 + i).padStart(2, "0")}`);
const MUL_WEEKS = ["2025-W30", "2025-W31"];
let addSkill = "";
let addName = "";
let set = "";
const keyOf = (week: string, skill = set) => ["assessment", SECTION, week, skill].join("~");

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G2", ["Asha"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  const sheet = async (topic: string) => {
    const [w] = await sql<{ id: string; skill: string }[]>`
      select t.id, t.skill_set_code as skill from sheet_template t join skill s on s.tenant_id = t.tenant_id and s.code = t.skill_set_code
      where t.source = 'library' and t.retired_at is null and s.topic_code = ${topic} and t.band = 'G2'
      order by t.skill_set_code, t.difficulty, t.code limit 1`;
    return w;
  };
  const add = await sheet("ADDSUB");
  const mul = await sheet("MUL");
  if (!add || !mul) throw new Error("needs a Grade 2 library worksheet on Addition & subtraction and one on Multiplication");
  addSkill = add.skill;
  set = add.skill;
  [{ name: addName }] = await sql<{ name: string }[]>`select name from skill where code = ${addSkill}`;
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and qr_code not like ${`CS${RUN}%`}`;
  // a name an earlier run gave stays in the history log (rule 4); a last row with an empty name gives the built name back
  await sql`
    insert into change_log (tenant_id, table_name, row_id, op, after, origin)
    select tenant_id, 'assessment', row_id, 'name', '{"name": ""}'::jsonb, 'u75' from (
      select distinct on (row_id) row_id, tenant_id, after ->> 'name' as name from change_log
      where table_name = 'assessment' and op = 'name' and row_id like ${`assessment~${SECTION}~%`} order by row_id, at desc, id desc) x
    where name <> ''`;
  const paper = (qr: string, template: string, week: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at, printed_at)
    values (${tenant}, ${qr}, ${template}, ${kids.Asha}, to_date(${week}, 'IYYY-"W"IW'), ${SECTION}, 'assessment', 'printed', 'u75', now(), now())`;
  for (const [i, w] of WEEKS.entries()) await paper(`CS${RUN}A${i.toString(16).toUpperCase()}`, add.id, w);
  for (const [i, w] of MUL_WEEKS.entries()) await paper(`CS${RUN}B${i}`, mul.id, w);
});
test.afterAll(async () => {
  // put away as a paper made in error is, so no later spec finds twelve more assessments on a page
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and print_status <> 'void'`;
  await sql.end();
});

const topicRow = (page: Page, code: string) => page.locator(`tr[data-topic='${code}']`);
const LIST = `/children/assessments?class=${SECTION}`;

test("a By topic view lists the topics collapsed, each with its count, next to Board and Table", async ({ page }) => {
  await page.goto(`${LIST}&view=table`);
  const views = page.getByRole("tablist", { name: "View" });
  await expect(views.getByRole("tab")).toHaveText(["Board", "Table", "By topic", "Reading"]);
  await views.getByRole("tab", { name: "By topic" }).click();
  await expect(page).toHaveURL(/view=topic/);
  await expect(views.getByRole("tab", { name: "By topic" })).toHaveAttribute("aria-selected", "true");
  const table = page.getByRole("table", { name: "Assessments by topic" });
  await expect(table.locator("thead th")).toContainText(["Topic", "Subject", "Assessments"]);
  const add = topicRow(page, "ADDSUB");
  await expect(add).toContainText("Addition & subtraction");
  await expect(add.locator("td").nth(2)).toHaveText("12");
  await expect(topicRow(page, "MUL").locator("td").nth(2)).toHaveText("2");
  // collapsed: no topic's assessments are drawn, and each topic says it is closed
  await expect(page.locator("tr[data-assessment]")).toHaveCount(0);
  await expect(add.locator("a[aria-expanded]")).toHaveAttribute("aria-expanded", "false");
  // the view is a place of its own, with the filters inside the page
  await expect(page.locator("[data-filterbar]")).toContainText("Class");
});

test("opening a topic shows only its assessments, ten to a page, and no other topic's rows are read", async ({ page }) => {
  await page.goto(`${LIST}&view=topic`);
  await topicRow(page, "ADDSUB").locator("a[aria-expanded]").click();
  await expect(page).toHaveURL(/t=ADDSUB/);
  const rows = page.locator("[data-topic-rows='ADDSUB'] tr[data-assessment]");
  await expect(rows).toHaveCount(10);
  // all of them Addition & subtraction; none of Multiplication's two is read or drawn
  await expect(page.locator("tr[data-assessment]")).toHaveCount(10);
  for (const name of await rows.locator("a[data-assessment-row]").allInnerTexts()) expect(name).toContain(addName);
  await expect(page.locator("[data-topic-rows='MUL']")).toHaveCount(0);
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  // the newest week first
  expect(await rows.first().getAttribute("data-assessment")).toContain(`~${WEEKS[11]}~`);
  await page.getByRole("link", { name: "Later →" }).click();
  await expect(page.locator("tr[data-assessment]")).toHaveCount(2);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  // closing it again leaves every topic collapsed
  await page.goto(`${LIST}&view=topic&t=ADDSUB`);
  await topicRow(page, "ADDSUB").locator("a[aria-expanded]").click();
  await expect(page.locator("tr[data-assessment]")).toHaveCount(0);
});

test("a stage and a class narrow the topics, and a class with nothing says so", async ({ page }) => {
  await page.goto(`${LIST}&view=topic&t=MUL`);
  // the papers are printed and not yet in, so they wait to be uploaded
  const stage = page.locator("[data-filterbar] select[name=status]");
  await stage.selectOption("upload");
  await expect(page).toHaveURL(/status=upload/);
  await expect(page.locator("tr[data-assessment]")).toHaveCount(2);
  await stage.selectOption("check");
  await expect(page.locator("tr[data-assessment]")).toHaveCount(0);
  await expect(page.getByText(/Nothing in .* matches these filters/)).toBeVisible();
  await expect(page.locator("[data-filterbar] select[name=class]")).toHaveValue(SECTION);
  await page.goto("/children/assessments?class=NO-SUCH-CLASS&view=topic");
  await expect(page.locator("tr[data-topic]")).toHaveCount(0);
});

test("a name an educator gives wins: from a row of the table, each name a row of the history log", async ({ page }) => {
  const key = keyOf(WEEKS[0]);
  // built until named: the topic, the skill, the class
  await page.goto(`${LIST}&week=${WEEKS[1]}&view=table`);
  const built = page.locator(`a[href="${assessmentHref(keyOf(WEEKS[1]))}"]`).first();
  await expect(built).toContainText(addName);
  await page.goto(`${LIST}&week=${WEEKS[0]}&view=table`);
  const names = [`Term 2 check ${Date.now()}`, `Term 2 check, retake ${Date.now()}`];
  for (const name of names) {
    const row = page.locator("tr", { has: page.locator(`a[href="${assessmentHref(key)}"]`) });
    await expect(row).toHaveCount(1);
    await row.getByLabel("Name this assessment").fill(name);
    await row.getByRole("button", { name: "Save the name" }).click();
    await expect(page.locator(`a[href="${assessmentHref(key)}"]`).first()).toHaveText(name);
  }
  const rows = await sql<{ name: string }[]>`select after ->> 'name' as name from change_log
    where table_name = 'assessment' and op = 'name' and row_id = ${key} order by at, id`;
  expect(rows.map((x) => x.name).slice(-2)).toEqual(names);
});

test("the assessment's own screen takes the name as its title, and a new name replaces it", async ({ page }) => {
  const key = keyOf(WEEKS[2]);
  await page.goto(assessmentHref(key));
  await expect(page.locator("h1")).toContainText(addName);
  const names = [`Week 12 addition ${Date.now()}`, `Week 12 addition, again ${Date.now()}`];
  for (const name of names) {
    await page.getByLabel("Name this assessment").fill(name);
    await page.getByRole("button", { name: "Save the name" }).click();
    await expect(page.locator("h1")).toHaveText(name);
  }
  await page.goto(`${LIST}&week=${WEEKS[2]}&view=table`);
  await expect(page.locator(`a[href="${assessmentHref(key)}"]`).first()).toHaveText(names[1]);
  const rows = await sql<{ name: string }[]>`select after ->> 'name' as name from change_log
    where table_name = 'assessment' and op = 'name' and row_id = ${key} order by at, id`;
  expect(rows.map((x) => x.name).slice(-2)).toEqual(names);
  // an empty name changes nothing
  await page.goto(assessmentHref(key));
  await page.getByLabel("Name this assessment").fill("   ");
  await page.getByRole("button", { name: "Save the name" }).click();
  await expect(page.locator("h1")).toHaveText(names[1]);
});

test("a Reading view says how the reader is doing and lists the files read lately, and a file can be read again (u10, u51)", async ({ page }) => {
  const FILE = `U75 scan ${Date.now()}.pdf`;
  const [t] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  await sql`insert into flow_run (tenant_id, flow, trigger, status, finished_at, result)
    values (${t.id}, 'read-scan', ${`e2e@cornerstone.test: ${FILE}`}, 'ok', now(), ${sql.json({ pages: 2, file: FILE, copies: [] })})`;
  try {
    await page.goto(`${LIST}&view=reading`);
    await expect(page.getByRole("tab", { name: "Reading" })).toHaveAttribute("aria-selected", "true");
    // the reader's record is the school's, never one person's: it names no child and no educator
    await expect(page.getByRole("heading", { name: "How the reader is doing" })).toBeVisible();
    const run = page.getByRole("table", { name: "Scans read last" }).getByRole("row").filter({ hasText: FILE }).first();
    await expect(run).toBeVisible();
    await run.getByRole("button", { name: "Read again" }).click();
    await expect(page).toHaveURL(/read=refused/);
    await expect(page.getByText("is no longer kept by the engine: send the scan again")).toBeVisible();
  } finally {
    await sql`delete from flow_run where flow = 'read-scan' and trigger like ${`%${FILE}`}`;
  }
});
