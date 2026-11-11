/**
 * U76 (UI-4b, PR 2) — a class's week on the assessment screen: the children with no paper and why, the spares with no name on them, and what one tap
 * approves (the old Papers to approve page, moved; the old spec is u37-papers-grouped test 1). A Grade 2 class of the test's own: this week a class
 * assessment on one skill: Asha's copy with the children, Bina's read with an answer waiting for a person, Chetan's to approve, and a spare to approve;
 * Dev's plan could not be given a paper, and why is kept on it; Esha joined after the week was planned.
 *
 * The screen names a copy by its Sr. No. only: the old page named the child; no name is shown here.
 */
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { assessmentHref } from "../lib/assessment-ui";
import { isoWeek } from "../lib/week";
import { aClass, aReadPaper } from "./rows";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U76D-CLASS";
const THIS = isoWeek();
const RUN = randomBytes(2).toString("hex").toUpperCase();
const code = (n: string) => `CS${RUN}${n}`;
const QR = { asha: code("A1"), bina: code("B2"), chetan: code("C3"), spare: code("5A") };
const WHY = "has sat every worksheet at Hard (4)";
let key = "";

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan", "Dev", "Esha"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  const ws = await sql<{ id: string; item_ids: string[]; skill: string }[]>`
    select id, item_ids, skill_set_code as skill from sheet_template
    where source = 'library' and retired_at is null and band = 'G2'
      and skill_set_code = (select skill_set_code from sheet_template where source = 'library' and retired_at is null
                            and band = 'G2' and difficulty = 'Hard' order by skill_set_code limit 1)
      and difficulty in ('Medium', 'Hard')
    order by difficulty = 'Hard' desc, code limit 4`;
  key = ["assessment", SECTION, THIS, ws[0].skill].join("~");
  // an earlier run's papers are put away, as a paper made in error is: the screen holds this run's alone
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and qr_code not like ${`CS${RUN}%`}`;
  const paper = (qr: string, w: string, child: string | null, status: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${tenant}, ${qr}, ${w}, ${child}, to_date(${THIS}, 'IYYY-"W"IW'), ${SECTION}, 'assessment', ${status},
           ${status === "new" ? null : "u76"}, ${status === "new" ? null : sql`now()`}`;
  await paper(QR.asha, ws[0].id, kids.Asha, "printed");
  await paper(QR.bina, ws[0].id, kids.Bina, "printed");
  await paper(QR.chetan, ws[0].id, kids.Chetan, "new");
  await paper(QR.spare, ws[0].id, null, "new");
  await aReadPaper(sql, { qr: QR.bina, child: kids.Bina, template: ws[0].id, items: ws[0].item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }] });
  // the week's plan: each child's level and the paper they were handed; Dev's could not be, and why is kept; Esha joined the class after it was made
  await sql`delete from prescription where child_id in ${sql(Object.values(kids))} and week = to_date(${THIS}, 'IYYY-"W"IW')`;
  const sheet = async (qr: string) => (await sql<{ id: string }[]>`select id from sheet_instance where qr_code = ${qr}`)[0].id;
  for (const [who, level, qr] of [["Asha", "Hard", QR.asha], ["Bina", "Hard", QR.bina], ["Chetan", "Medium", QR.chetan], ["Dev", "Hard", null]] as const) {
    await sql`
      insert into prescription (tenant_id, child_id, week, kind, skill_set_code, difficulty, rule_fired, strand, sheet_instance_id, no_paper, created_at)
      values (${tenant}, ${kids[who]}, to_date(${THIS}, 'IYYY-"W"IW'), 'assessment', ${ws[0].skill}, ${level}, 'band_default', 'NUM',
              ${qr ? await sheet(qr) : null}, ${qr ? null : WHY}, now() - interval '1 day')`;
  }
  await sql`update child set created_at = now() where id = ${kids.Esha}`;
});
test.afterAll(async () => {
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and print_status <> 'void'`;
  await sql.end();
});

test("the screen says which children have no paper and why, by Sr. No.", async ({ page }) => {
  await page.goto(assessmentHref(key));
  const none = page.getByRole("region", { name: "Children with no paper" });
  const table = none.getByRole("table", { name: "Children with no paper" });
  await expect(table.locator("thead th")).toHaveText(["Sr. No.", "Why", "State"]);
  // every child of the class without a paper, and why, with a status that says so: Dev's plan could not be given a paper; Esha joined after
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  const dev = rows.filter({ hasText: WHY });
  await expect(dev).toHaveCount(1);
  await expect(dev).toContainText("No paper");
  await expect(rows.filter({ hasText: "joined the class after this week was planned" })).toHaveCount(1);
  // no name is shown: a child is a Sr. No.
  await expect(none).not.toContainText(/Dev|Esha/);
});

test("a spare copy is listed with no name on it", async ({ page }) => {
  await page.goto(assessmentHref(key));
  const spares = page.getByRole("region", { name: "Spare copies" });
  await expect(spares).toContainText("with no name on them");
  const rows = spares.getByRole("table", { name: "Spare copies" }).locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(QR.spare);
  await expect(rows.first()).toContainText("To approve");
  // the spare is not one of the children's copies: the screen counts three children's papers
  await expect(page.getByTestId("in")).toHaveText(/of 3 in/);
});
