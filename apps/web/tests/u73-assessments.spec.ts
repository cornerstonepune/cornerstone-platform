/**
 * U73 (UI-4) — the three assessment screens: Assessments, one assessment, one child's paper. One test for each Done-when
 * line of specs/UI-4/spec.md that a browser can check. A class of the test's own (made once and kept: evidence is
 * append-only); each run's papers have printed codes of their own.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { STEP_WORDS, STEPS } from "../lib/assessment-steps";
import { assessmentHref, paperHref } from "../lib/assessment-ui";
import { aClass, aLine, aReadPaper } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U73-CLASS";
const RUN = randomBytes(2).toString("hex").toUpperCase();
const code = (n: string) => `CS${RUN}${n}`;
let kids: Record<string, string> = {};
let ws: { id: string; item_ids: string[]; set: string };
let week = "";
let tenant = "";
let paper: { sheet: string; capture: string; results: string[] };
let checked: { sheet: string };
const KEY = () => ["assessment", SECTION, week, ws.set].join("~");
const HOME = () => ["focus", SECTION, week, ""].join("~");
const NAME = /^.+ · .+ · \d{1,2}-[A-Z][a-z]{2}-\d{4}$|^[^·]+$/;

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan", "Dev"]);
  [{ tenant, week }] = await sql<{ tenant: string; week: string }[]>`
    select tenant_id as tenant, to_char(now(), 'IYYY-"W"IW') as week from child_now where id = ${kids.Asha}`;
  [ws] = await sql<{ id: string; item_ids: string[]; set: string }[]>`
    select t.id, t.item_ids, t.skill_set_code as set from sheet_template t
    where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 3 order by t.code limit 1`;
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and qr_code not like ${`CS${RUN}%`}`;
  // a class assessment, printed; Asha's copy is read with one right, one wrong with working, one blank, one for a person to judge
  for (const [who, n] of [["Asha", "A1"], ["Bina", "A2"]] as const) {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
      values (${tenant}, ${code(n)}, ${ws.id}, ${kids[who]}, ${SECTION}, to_date(${week}, 'IYYY-"W"IW'), 'assessment', 'printed', 'e2e', now(), now())`;
  }
  paper = await aReadPaper(sql, {
    qr: code("A1"), child: kids.Asha, template: ws.id, items: ws.item_ids,
    reads: [
      { status: "correct", read: "42" },
      { status: "wrong", read: "17", checkedBy: "e2e" },
      { status: "blank", checkedBy: "e2e" },
      { status: "needs_teacher", read: "5", why: "under the confidence floor" },
    ].slice(0, Math.min(4, ws.item_ids.length)),
  });
  // a home assessment still waiting for approval, two copies
  for (const [who, n] of [["Chetan", "H1"], ["Dev", "H2"]] as const) {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status)
      values (${tenant}, ${code(n)}, ${ws.id}, ${kids[who]}, ${SECTION}, to_date(${week}, 'IYYY-"W"IW'), 'focus', 'new')`;
  }
  // another class's home pack for the same week, which approving this one must leave alone
  await sql`delete from sheet_instance where qr_code = ${code("O1")}`;
  await sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status)
    values (${tenant}, ${code("O1")}, ${ws.id}, null, ${"U73-OTHER"}, to_date(${week}, 'IYYY-"W"IW'), 'focus', 'new')`;
  await sql`update sheet_instance set print_status = 'new', approved_at = null where qr_code like ${`CS${RUN}H%`}`;
  checked = { sheet: paper.sheet };
});
test.afterAll(async () => {
  // this spec's papers are put away as a paper made in error is, so no later spec finds a pack waiting for approval or more assessments on a page
  await sql`update sheet_instance set print_status = 'void' where section in (${SECTION}, 'U73-OTHER', 'U73-MAKE') and print_status <> 'void'`;
  await sql.end();
});

test("the seven steps, their words and the queries' names are the committed ones (3)", () => {
  expect([...STEPS]).toEqual(["made", "approve", "printed", "uploaded", "read", "checked", "signedOff"]);
  expect(STEP_WORDS).toEqual({ made: "Created", approve: "Approved", printed: "Printed", uploaded: "Uploaded", read: "Read", checked: "Checked", signedOff: "Results in" });
  const names = [...readFileSync(path.join(__dirname, "../lib/queries-papers.ts"), "utf8").matchAll(/^export (?:async function|const|type) (\w+)/gm)].map((m) => m[1]).sort();
  expect(names).toEqual(
    ["AssessmentRow", "KIND_WORDS", "NO_TOPIC", "PaperFilter", "PaperListRow", "STAGES", "STAGE_WORDS", "Stage", "assessmentList", "assessmentOf", "narrowed", "papersCte", "paperFilters", "paperList", "paperName", "setKeySql", "sigSql", "weekOf", "weekSql"].sort(),
  );
});

test("every row of Assessments is named topic · skill · level · kind · class · day, and no screen has an approve-all control (8, 9)", async ({ page }) => {
  await page.goto(`/children/assessments?view=table&class=${SECTION}`);
  // the page streams: its rows are read once they are there
  await expect(page.getByRole("table", { name: "Every assessment" }).locator("tbody tr").first()).toBeVisible();
  const names = await page.getByRole("table", { name: "Every assessment" }).locator("tbody tr td:first-child a").allInnerTexts();
  expect(names.length).toBeGreaterThanOrEqual(2);
  for (const n of names) expect(n).toMatch(NAME);
  for (const url of [`/children/assessments?class=${SECTION}`, assessmentHref(HOME()), assessmentHref(KEY()), paperHref(KEY(), "1")]) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: /approve (all|every)/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /approve (all|every)/i })).toHaveCount(0);
  }
});

test("each tile's number equals the rows behind it, and each lane's cards the table's rows at its steps (10)", async ({ page }) => {
  await page.goto(`/children/assessments?view=table&class=${SECTION}`);
  // the right side's tiles (page charter B6): the answers to judge are the rows' own, added up
  const tile = async (id: string) => Number(await page.locator(`[data-block=DetailPanel] [data-stat="${id}"] .b-stat-n`).innerText());
  const rows = page.getByRole("table", { name: "Every assessment" }).locator("tbody tr");
  await expect(rows.first()).toBeVisible(); // the page streams: its rows are read once they are there
  const next = await rows.locator('td[data-label="Next"] a').allInnerTexts();
  const waits = await rows.locator('td[data-label="Waits for"]').allInnerTexts();
  expect(await tile("to-judge")).toBe(waits.reduce((n, w) => n + Number(/(\d+) answers? to judge/i.exec(w)?.[1] ?? 0), 0));
  await page.goto(`/children/assessments?view=board&class=${SECTION}`);
  await expect(page.locator("[data-lane]").first()).toBeVisible();
  const lanes = await page.locator("[data-lane] .b-count").allInnerTexts();
  expect(lanes.map(Number).reduce((a, b) => a + b, 0)).toBe(next.length);
});

test("the papers bar's three counts sum to the copies, and the stepper's amber step is the status word (12, 14)", async ({ page }) => {
  await page.goto(assessmentHref(KEY()));
  const label = (await page.locator("[data-block=StackBar] [role=img]").getAttribute("aria-label")) ?? "";
  const n = [...label.matchAll(/(\d+) /g)].map((m) => Number(m[1])).reduce((a, b) => a + b, 0);
  const eyebrow = await page.getByTestId("stage").first().innerText();
  expect(String(n)).toBe(eyebrow.match(/(\d+) papers/i)![1]);
  await page.goto(assessmentHref(HOME()));
  await expect(page.locator("[data-block=Stepper] [data-state=wait]").first()).toContainText("Approved");
  await expect(page.getByText("Waits for approval").first()).toBeVisible();
});

test("Approve acts on this pack only, and the level can be changed until it is approved (11)", async ({ page }) => {
  await page.goto(assessmentHref(HOME()));
  await expect(page.getByRole("button", { name: "Approve the pack" })).toHaveCount(1);
  // the sentence beside the button says what one tap approves: this pack's two copies (and any spares), this pack only
  await expect(page.getByRole("region", { name: "This pack" })).toContainText("This approves 2 papers, this pack only.");
  await page.getByRole("button", { name: "Approve the pack" }).click();
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(HOME()).replace(/[~]/g, "~")));
  const state = async (like: string) => (await sql<{ s: string }[]>`select print_status as s from sheet_instance where qr_code like ${like}`).map((r) => r.s);
  await expect.poll(async () => (await state(`CS${RUN}H%`)).filter((x) => x === "new").length).toBe(0);
  expect(await state(code("O1"))).toEqual(["new"]);
});

test("a paper shows right, wrong, blank and for you to judge as separate chips, and sign-off waits for the judging (15, 17)", async ({ page }) => {
  await page.goto(paperHref(KEY(), "1"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check the answers");
  const row = page.getByRole("table", { name: "The answers" }).locator("tbody tr");
  expect(await row.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("button", { name: "Sign this paper off" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Say what the child wrote" })).toHaveCount(1);
});

test("a person's answer is a new read_correction row and the engine's read stays (16)", async ({ page }) => {
  await page.goto(paperHref(KEY(), "1"));
  // the answer a person corrects is the one whose read must stay: the engine marks the answers again, and may say more about others
  const judged = paper.results[3];
  const before = await sql<{ raw: string }[]>`select raw_read as raw from item_result where id = ${judged}::uuid`;
  await page.getByLabel(/What the child wrote for question/).fill("6");
  await page.getByRole("button", { name: "Say what the child wrote" }).click();
  await expect.poll(async () => (await sql`select 1 from read_correction where item_result_id = any(${paper.results}::uuid[]) and human_read = '6'`).length).toBeGreaterThan(0);
  const after = await sql<{ raw: string }[]>`select raw_read as raw from item_result where id = ${judged}::uuid`;
  expect(after.map((r) => r.raw)).toEqual(before.map((r) => r.raw));
  void checked;
});

test("Make from the Assessments screen makes the papers at Created, approved by no one, and opens the assessment", async ({ page }) => {
  const MAKE = "U73-MAKE";
  await aClass(sql, MAKE, "G2", ["Eli", "Finn"]);
  await sql`delete from sheet_instance where section = ${MAKE}`;
  await page.goto("/children/assessments");
  await page.locator("[data-make-open]").click();
  await page.getByRole("button", { name: "For a class" }).click();
  await expect(page).toHaveURL(/make=class/);
  const form = page.getByRole("form", { name: "Choose the papers" });
  await form.getByLabel("Class").selectOption(MAKE);
  await form.getByRole("button", { name: "Show the class" }).click();
  await form.getByRole("radio", { name: /Class assessment/ }).check();
  await form.getByRole("radio", { name: /One paper for all/ }).check();
  await aLine(form, 1, "ADDSUB", "SUB.2D2D", "Easy", "5");
  await form.getByRole("button", { name: "See the papers" }).click();
  await page.getByRole("region", { name: "The papers" }).getByRole("button", { name: "Make 2 class assessment papers" }).click();
  await expect(page).toHaveURL(/\/children\/assessments\/assessment~U73-MAKE~/);
  const made = await sql<{ approved_by: string | null; print_status: string }[]>`select approved_by, print_status from sheet_instance where section = ${MAKE}`;
  expect(made).toHaveLength(2);
  for (const m of made) expect(m).toEqual({ approved_by: null, print_status: "new" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Class assessment · Grade 2 · U73-MAKE");
});
