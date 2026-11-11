/**
 * U37 — Assessments grouped, and a class's papers to approve said copy by copy (goals/ux5-papers-grouped.yaml), on the
 * assessment's own screen (the old Assessments page that opened in place, and Papers to approve, are retired).
 * Nimish, 2026-10-11: "This cannot be just such a freaking long list of stuff. Need to make it more readable." and
 * "the assessment page needs to have the filter and the view by topic and all"; 2026-10-15: "All these things should be
 * expandable and collapsible. They should have the right set of columns which are important."
 *
 * A Grade 2 class of the test's own, its educator signed in for what only they see:
 * - this week, a class assessment on one skill: Asha's copy with the children, Bina's read with an answer waiting for
 *   a person, Chetan's to approve, and a spare to approve; Dev's plan could not be given a paper, and why is kept on it;
 *   Esha joined after the week was planned;
 * - a week long past, a class practice: Asha's copy with the children.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass, aReadPaper, aPerson, forgetPerson } from "./rows";
import { isoWeek } from "../lib/week";
import { assessmentHref } from "../lib/assessment-ui";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U37-CLASS";
const THIS = isoWeek();
const OLD = "2026-W30";
const QR = { asha: "CS370A01", bina: "CS370B02", chetan: "CS370C03", spare: "CS3705A1", old: "CS3700D1" };
const WHY = "has sat every worksheet at Hard (4)";
const EDUCATOR = { email: "u37-educator@cornerstone.test", name: "U37 Educator", role: "educator", classes: [SECTION] };
const PASSWORD = "u37-a-long-test-password";
let kids: Record<string, string> = {};
let set = "";

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan", "Dev", "Esha"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  // one skill's worksheets from the library, at two levels
  const ws = await sql<{ id: string; item_ids: string[]; skill: string; level: string }[]>`
    select id, item_ids, skill_set_code as skill, difficulty as level from sheet_template
    where source = 'library' and retired_at is null and band = 'G2'
      and skill_set_code = (select skill_set_code from sheet_template where source = 'library' and retired_at is null
                            and band = 'G2' and difficulty = 'Hard' order by skill_set_code limit 1)
      and difficulty in ('Medium', 'Hard')
    order by difficulty = 'Hard' desc, code limit 4`;
  set = ws[0].skill;
  const paper = (qr: string, w: string, child: string | null, week: string, kind: string, status: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status,
                                approved_by, approved_at)
    select ${tenant}, ${qr}, ${w}, ${child}, to_date(${week}, 'IYYY-"W"IW'), ${SECTION}, ${kind}, ${status},
           ${status === "new" ? null : "u37"}, ${status === "new" ? null : sql`now()`}
    where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  await paper(QR.asha, ws[0].id, kids.Asha, THIS, "assessment", "printed");
  await paper(QR.bina, ws[1].id, kids.Bina, THIS, "assessment", "printed");
  await paper(QR.chetan, ws[2].id, kids.Chetan, THIS, "assessment", "new");
  await paper(QR.spare, ws[3].id, null, THIS, "assessment", "new");
  await paper(QR.old, ws[1].id, kids.Asha, OLD, "practice", "printed");
  // Bina's copy read: one answer waits for a person
  await aReadPaper(sql, {
    qr: QR.bina,
    child: kids.Bina,
    template: ws[1].id,
    items: ws[1].item_ids.slice(0, 2),
    reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }],
  });
  // the week's plan: each child's level, and the paper they were handed; Dev's could not be, and why is kept;
  // Esha joined the class after it was made
  await sql`delete from prescription where child_id in ${sql(Object.values(kids))} and week = to_date(${THIS}, 'IYYY-"W"IW')`;
  const sheet = async (qr: string) => (await sql<{ id: string }[]>`select id from sheet_instance where qr_code = ${qr}`)[0].id;
  for (const [who, level, qr] of [
    ["Asha", "Hard", QR.asha],
    ["Bina", "Hard", QR.bina],
    ["Chetan", "Medium", QR.chetan],
    ["Dev", "Hard", null],
  ] as const) {
    await sql`
      insert into prescription (tenant_id, child_id, week, kind, skill_set_code, difficulty, rule_fired, strand,
                                sheet_instance_id, no_paper, created_at)
      values (${tenant}, ${kids[who]}, to_date(${THIS}, 'IYYY-"W"IW'), 'assessment', ${ws[0].skill}, ${level}, 'band_default', 'NUM',
              ${qr ? await sheet(qr) : null}, ${qr ? null : WHY}, now() - interval '1 day')`;
  }
  await sql`update child set created_at = now() where id = ${kids.Esha}`;
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

// an assessment is addressed by its key: the kind, the class, the week and the skill; its row in the table carries it
const KEY = (week: string, kind: string) => [kind, SECTION, week, set].join("~");
const row = (page: Page, key: string) => page.locator(`tr[data-assessment="${key}"]`);
/** One group of the assessment's copies, by where they stand (the screen's own regions: "Answers to judge, 1 copies"). */
const group = (page: Page, label: string) => page.getByRole("region", { name: new RegExp(`^${label}, \\d+ copies$`) });

test("an assessment opens to its copies, each in the group of where it stands, its spares listed apart", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/children/assessments?view=table");
  const key = KEY(THIS, "assessment");
  await expect(row(page, key)).toHaveCount(1);
  const open = row(page, key).locator("a[data-assessment-row]");
  await expect(open).toHaveAttribute("href", assessmentHref(key));
  await page.goto(assessmentHref(key)); // the row's own address, the whole page waited for
  // the steps the school does, in order, over the copies; each copy a row with its Sr. No. and level (names stay off it)
  const steps = page.locator('[data-block="Stepper"]');
  for (const h of ["Created", "Printed", "Uploaded", "Read", "Checked", "Results in"]) await expect(steps).toContainText(h);
  // three copies: Bina's read with an answer for a person first, Asha's with the children, Chetan's to approve (the tables
  // stream in after the steps: counted, and so waited for, before their headings are read)
  const copies = page.locator('section[aria-label$=" copies"]:not([data-spares]) tbody tr');
  await expect(copies).toHaveCount(3);
  // asserted (and so waited for), not read at one instant: while the page streams in, the table can stand only in React's hidden holder
  const heads = page.getByRole("table", { name: "Answers to judge" }).locator("thead th");
  await expect(heads.first()).toHaveText("Sr. No.");
  await expect(heads.filter({ hasText: /^Level$/ })).toHaveCount(1);
  const judge = group(page, "Answers to judge").locator("tbody tr");
  await expect(judge).toHaveCount(1);
  await expect(judge.locator('td[data-label="Sr. No."]')).toHaveText("2");
  await expect(judge.locator('[data-status="judge"]')).toBeVisible();
  // a copy read opens its answers: the paper screen, by the assessment and the Sr. No.
  await expect(judge.locator("[data-check-paper]")).toHaveText("Check this paper");
  await expect(judge.locator("[data-check-paper]")).toHaveAttribute("href", /^\/children\/assessments\/[^/]+\/2$/);
  const out = group(page, "With the children").locator("tbody tr");
  await expect(out.locator('td[data-label="Sr. No."]')).toHaveText("1");
  await expect(out.locator('td[data-label="Level"]')).toContainText("Hard");
  const made = group(page, "Not printed yet").locator("tbody tr");
  await expect(made.locator('td[data-label="Sr. No."]')).toHaveText("3");
  await expect(made.locator('[data-status="toApprove"]')).toBeVisible();
  // the spares: listed apart from the children's copies
  const spares = page.getByRole("table", { name: "Spare copies" }).locator("tbody tr");
  await expect(spares).toHaveCount(1);
  await expect(spares).toContainText(QR.spare);
  await page.context().close();
});

test("the one filter row is there, with its active filters, and a child chosen shows the assessments of their copies", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto("/children/assessments");
  const bar = page.locator("[data-filterbar]");
  await expect(bar).toBeVisible();
  for (const l of ["Class", "Topic", "Subject", "Kind", "Week", "Status"]) await expect(bar.locator(`select[name="${({ Class: "class", Topic: "topic", Subject: "subject", Kind: "kind", Week: "week", Status: "status" } as Record<string, string>)[l]}"]`)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "View" })).toHaveCount(0);
  await expect(page.locator("[data-active-filters]")).toHaveCount(0);
  // a child chosen: the assessments they have a copy in, this week's and the one long past
  await page.goto(`/children/assessments?child=${kids.Asha}&view=table`);
  await expect(row(page, KEY(OLD, "practice"))).toHaveCount(1);
  await expect(row(page, KEY(THIS, "assessment"))).toHaveCount(1);
  await expect(page.locator("tr[data-assessment]")).toHaveCount(2);
  await page.context().close();
});

test("class papers to approve says each copy, why a child has no paper, and counts what it approves", async ({ page }) => {
  await page.goto(assessmentHref(KEY(THIS, "assessment")));
  // every child of the class without a paper, by Sr. No., and why, with a status that says so: Dev's plan, Esha joined late
  const none = page.getByRole("table", { name: "Children with no paper" }).locator("tbody tr");
  await expect(none).toHaveCount(2);
  const dev = none.filter({ has: page.locator('td[data-label="Sr. No."]', { hasText: /^4$/ }) });
  await expect(dev).toContainText(WHY);
  await expect(dev.locator("[data-status=noPaper]")).toBeVisible();
  await expect(none.filter({ has: page.locator('td[data-label="Sr. No."]', { hasText: /^5$/ }) })).toContainText("joined the class after this week was planned");
  // the level of the paper to approve, and its status; the copy given out is with the children
  const made = group(page, "Not printed yet").locator("tbody tr");
  await expect(made.locator('td[data-label="Level"]')).toContainText("Medium");
  await expect(made.locator("[data-status=toApprove]")).toBeVisible();
  await expect(group(page, "With the children").locator("[data-status=withChildren]")).toBeVisible();
  // the approval says what one tap approves: Chetan's paper and the spare
  const pack = page.getByRole("region", { name: "This pack" });
  await expect(pack).toContainText("This approves 1 paper and 1 spare, this pack only.");
  await expect(pack.getByRole("button", { name: "Approve the pack" })).toBeEnabled();
});

test("papers to approve has one main action and ends on a next step (goals/uxn4-papers-to-approve.yaml)", async ({ page }) => {
  await page.goto(assessmentHref(KEY(THIS, "assessment")));
  // the one main action is the pack's approval; the page ends on the next step
  await expect(page.locator("[data-ux=action]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Approve the pack" })).toHaveAttribute("data-ux", "action");
  await expect(page.locator("[data-ux=next]")).toHaveAttribute("href", "/children");
  // no hand-drawn tag for a class and week
  await expect(page.getByRole("navigation", { name: "Classes and weeks" })).toHaveCount(0);
});
