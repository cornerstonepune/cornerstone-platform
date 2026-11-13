/**
 * U96 — "An assessment / a child's paper: become B6's panel; full-page address kept for links" (page charter Part C). One test per line:
 * the assessment's address draws the board's panel opened full page, with the same tabs; every action the full page had is still there; a
 * child's paper is the same panel, its Check tab open on that paper; and the board's panel links to the full page. The class is the
 * spec's own (U96P), its children from tests/fake-names.ts; each run makes a class practice pack of its own (two copies, codes new each
 * run), one copy read with an answer still to judge.
 */
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { aClass, aReadPaper } from "./rows";
import { assessmentHref, openIdOf, paperHref } from "../lib/assessment-ui";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U96P";
const RUN = randomBytes(2).toString("hex").toUpperCase();
const NAMES = FAKE_CHILDREN.slice(5, 7) as string[];
let key = "";
let tenant = "";
let ws: { id: string; item_ids: string[]; set: string };
let kids: Record<string, string> = {};
const TABS = ["Copies", "Upload", "Check", "Results"];
const panel = (page: import("@playwright/test").Page) => page.locator("main [data-block=DetailPanel]");

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", NAMES);
  let week = "";
  [{ tenant, week }] = await sql<{ tenant: string; week: string }[]>`select tenant_id as tenant, to_char(now(), 'IYYY-"W"IW') as week from child_now where id = ${kids[NAMES[0]]}`;
  [ws] = await sql<{ id: string; item_ids: string[]; set: string }[]>`
    select t.id, t.item_ids, t.skill_set_code as set from sheet_template t
    where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 2 order by t.code limit 1`;
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and qr_code not like ${`CS${RUN}%`}`;
  for (const [i, name] of NAMES.entries())
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
      values (${tenant}, ${`CS${RUN}0${i}`}, ${ws.id}, ${kids[name]}, ${SECTION}, to_date(${week}, 'IYYY-"W"IW'), 'practice', 'printed', 'e2e', now(), now())`;
  await aReadPaper(sql, { qr: `CS${RUN}00`, child: kids[NAMES[0]], template: ws.id, items: ws.item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }] });
  key = ["practice", SECTION, week, ws.set].join("~");
});
test.afterAll(async () => {
  await sql.end();
});

test("an assessment's address is the board's panel opened full page: the same tabs, no close, the address kept", async ({ page }) => {
  await page.goto(assessmentHref(key));
  await expect(panel(page)).toHaveAttribute("data-inline", "");
  await expect(panel(page).getByRole("tab")).toHaveText(TABS);
  await expect(panel(page).locator("[data-panel-close], [data-panel-full]")).toHaveCount(0);
  // the board's panel of the same assessment opens this very address full page
  await page.goto(`/children/assessments?class=${SECTION}&open=assessment:${openIdOf(key)}`);
  await expect(page.locator("[data-panel-full]")).toHaveAttribute("href", assessmentHref(key));
  await expect(page.locator("[data-block=DetailPanel]").getByRole("tab")).toHaveText(TABS);
});

test("every action the full page had is kept: the pack's day given, each copy's own action, the name, and upload on its tab", async ({ page }) => {
  await page.goto(assessmentHref(key));
  // above the tabs: the pack, printed, and the day it was given
  await expect(panel(page).getByRole("region", { name: "This pack" }).getByRole("button", { name: "Given on" })).toBeVisible();
  // Copies (the first tab): the steps, each child's copy with its own action, and the name
  await expect(panel(page).locator('[data-block="Stepper"]')).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Check this paper" }).first()).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /Away: hold it for later/ }).first()).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Save the name" })).toBeVisible();
  // Upload, as on the board
  await panel(page).getByRole("tab", { name: "Upload" }).click();
  await expect(page).toHaveURL(/tab=upload/);
  await expect(panel(page).getByRole("region", { name: "Upload papers" }).locator("input[type=file]")).toHaveCount(1);
  // Check: the paper waiting, which opens the child's paper
  await panel(page).getByRole("tab", { name: "Check" }).click();
  await panel(page).locator("[data-check] [data-check-paper]").first().click();
  await expect(page).toHaveURL(new RegExp(`${paperHref(key, "1").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});

test("a child's paper is the same panel opened full page, its Check tab open on that paper with every control the paper had", async ({ page }) => {
  await page.goto(paperHref(key, "1"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check the answers");
  await expect(panel(page).getByRole("tab")).toHaveText(TABS);
  await expect(panel(page).getByRole("tab", { name: "Check" })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("table", { name: "The answers" })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Say what the child wrote" })).toBeVisible();
  // the assessment's other tabs are there too, and where the paper leads
  await panel(page).getByRole("tab", { name: "Copies" }).click();
  await expect(panel(page).locator("[data-copies]")).toBeVisible();
  await expect(panel(page).locator("[data-part=leads]").getByRole("link", { name: "The assessment" })).toHaveAttribute("href", assessmentHref(key));
});
