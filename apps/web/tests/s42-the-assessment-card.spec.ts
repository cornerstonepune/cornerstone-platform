/**
 * S42 — one assessment as one card, Made to Results (goals/s2-the-assessment-card.yaml). Slice S2 of the scope Nimish
 * locked on 2026-10-22: "the assessment as one card moving Made → approved for print → Given → Papers in → Read →
 * Checked → Signed off → Results". The card is the assessment's own screen now (the old /papers/card is retired): its
 * steps, each child's copy by its Sr. No. in the group of where it stands, and the one thing to do next.
 *
 * A Grade 2 class of the test's own (made once and kept: evidence is append-only), and each run its own assessments,
 * their printed codes new each run, so the card starts at Made every time: a class practice paper for Asha, Bina and
 * Chetan, with a spare; and a class assessment that comes back with no one saying it was given.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass, aReadPaper } from "./rows";
import { assessmentHref } from "../lib/assessment-ui";

test.describe.configure({ mode: "serial" });
// a laptop's width: at 1280 px the copies' Action column runs under the rail (reported; the table and rail are shared blocks)
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "S42-CLASS";
const RUN = randomBytes(2).toString("hex").toUpperCase();
const code = (n: string) => `CS${RUN}${n}`; // CS + 4 hex of the run + 2 hex of the copy
const QR = { Asha: code("A1"), Bina: code("A2"), Chetan: code("A3"), spare: code("AF") };
let kids: Record<string, string> = {};
let ws: { id: string; item_ids: string[]; set: string; title: string };
let week = "";
let tenant = "";

// the assessment's own screen: its key is the kind, the class, the week and the skill set
const card = (kind: string) => assessmentHref([kind, SECTION, week, ws.set].join("~"));
// the one thing to do next, said under the steps: "1 answer to judge. Check 1 answer."
const next = (page: Page) => page.locator('[data-block="Stepper"] + p.b-caption');
const steps = (page: Page) => page.locator('[data-block="Stepper"]');
// one child's copy by its Sr. No. (names stay off the screen), whichever group it stands in
const copy = (page: Page, roll: string) =>
  page.locator('section[aria-label$=" copies"]:not([data-spares]) tbody tr').filter({ has: page.locator('td[data-label="Sr. No."]', { hasText: new RegExp(`^${roll}$`) }) });
const ROLL = { Asha: "1", Bina: "2", Chetan: "3" };

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan"]);
  [{ tenant, week }] = await sql<{ tenant: string; week: string }[]>`
    select tenant_id as tenant, to_char(now(), 'IYYY-"W"IW') as week from child_now where id = ${kids.Asha}`;
  [ws] = await sql<{ id: string; item_ids: string[]; set: string; title: string }[]>`
    select t.id, t.item_ids, t.skill_set_code as set, s.name || ' · ' || t.difficulty as title
    from sheet_template t join skill s on s.code = t.skill_set_code
    where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 2 order by t.code limit 1`;
  // an earlier run's papers are put away, as a paper made in error is: the card holds this run's alone
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION} and qr_code not like ${`CS${RUN}%`}`;
  for (const [who, qr] of Object.entries(QR)) {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status)
      values (${tenant}, ${qr}, ${ws.id}, ${who === "spare" ? null : kids[who]}, ${SECTION}, to_date(${week}, 'IYYY-"W"IW'), 'practice', 'new')`;
  }
  // the class assessment, printed, whose papers come back with no one pressing "Given on"
  for (const [who, n] of [["Asha", "B1"], ["Bina", "B2"]] as const) {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status,
                                  approved_by, approved_at, printed_at)
      values (${tenant}, ${code(n)}, ${ws.id}, ${kids[who]}, ${SECTION}, to_date(${week}, 'IYYY-"W"IW'), 'assessment', 'printed', 'e2e', now(), now())`;
  }
});
test.afterAll(async () => {
  await sql`delete from flow_run where flow = 'read-scan' and trigger like 's42:%'`;
  await sql.end();
});

// The Upload papers page is retired (page charter B6): papers are uploaded inside the assessment they belong to, on its Upload tab on the
// board and on its own page once its pack is printed.
test("the upload box is inside the assessment: its Upload tab on the board, and the same tab on its own page (the panel opened full page)", async ({ page }) => {
  await page.goto(`/children/assessments?class=${SECTION}`);
  // the printed class assessment is with the children: its card's next action is Upload, which opens that tab of its panel
  await page.locator('[data-lane="children"] [data-card-next]', { hasText: "Upload" }).first().click();
  const panel = page.locator("[data-block=DetailPanel]");
  await expect(panel.getByRole("tab", { name: "Upload" })).toHaveAttribute("aria-selected", "true");
  const tab = panel.getByRole("region", { name: "Upload papers" });
  await expect(tab.locator("input[type=file]")).toHaveCount(1);
  await expect(tab.getByText("Choose scans or drop them here")).toBeVisible();
  // the assessment's own page is the panel opened full page: the same box, on the same tab
  await page.goto(`${card("assessment")}?tab=upload`);
  await expect(page.locator("[data-block=DetailPanel]").getByRole("tab", { name: "Upload" })).toHaveAttribute("aria-selected", "true");
  const own = page.locator("[data-block=DetailPanel]").getByRole("region", { name: "Upload papers" });
  await expect(own.locator("input[type=file]")).toHaveCount(1);
  await expect(own.getByText("Choose scans or drop them here")).toBeVisible();
});

test("the card moves from Made to Results, always showing its next step", async ({ page }) => {
  // approved for print, as the approve page does
  await sql`update sheet_instance set print_status = 'printed', approved_by = 'e2e', approved_at = now(), printed_at = now()
            where qr_code in ${sql(Object.values(QR))}`;
  await page.goto(card("practice"));
  await expect(next(page)).toHaveText("With the children. Upload.");
  await page.getByLabel("Day it was given").fill(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  await page.getByRole("button", { name: "Given on" }).click();
  await expect(page.getByTestId("given")).toContainText("Given on");
  await expect(page.getByTestId("in")).toHaveText(/0 of 3 in · missing: roll 1, roll 2, roll 3/);

  const asha = await aReadPaper(sql, { qr: QR.Asha, child: kids.Asha, template: ws.id, items: ws.item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "correct", read: "2" }] });
  const bina = await aReadPaper(sql, { qr: QR.Bina, child: kids.Bina, template: ws.id, items: ws.item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }] });
  await page.reload();
  await expect(page.getByTestId("in")).toHaveText(/2 of 3 in · missing: roll 3/);
  // Chetan was away: his paper is held for later, not missing
  await copy(page, ROLL.Chetan).getByRole("button", { name: "Away: hold it for later" }).click();
  await expect(page.getByTestId("in")).toHaveText(/2 of 3 in · away, held for later: roll 3/);
  // an answer waits for a person: checking is next, and Bina's paper opens to be checked
  await expect(next(page)).toHaveText("1 answer to judge. Check 1 answer.");
  await expect(copy(page, ROLL.Bina).getByRole("link", { name: "Check this paper" })).toBeVisible();

  // a person settles Bina's answer, which signs her paper off; Asha's waits to be signed off
  await sql`select resolve_result(${bina.results[1]}::uuid, 'correct', '{}', 'e2e')`;
  await page.reload();
  await expect(next(page)).toHaveText("To sign off. Sign off 1 paper.");
  await expect(copy(page, ROLL.Asha).getByRole("button", { name: "Sign it off" })).toBeVisible();
  await sql`select confirm_results(${kids.Asha}::uuid, 'e2e', ${asha.capture}::uuid)`;
  await page.reload();
  // both papers in are signed off: their results are in (Chetan's, held for later, is still with him)
  await expect(steps(page)).toContainText("Results in 2 of 3");
  const asha_row = copy(page, ROLL.Asha);
  await expect(asha_row.locator('td[data-label="Score"]')).toContainText("2 of 2");
  await asha_row.getByRole("link", { name: "The child" }).click();
  await expect(page).toHaveURL(new RegExp(`/growth/${kids.Asha}$`));
});

test("a page to photograph again is flagged, a child away is carried, the papers not back are listed", async ({ page }) => {
  // the newest file holding Chetan's copy lacked its second page, as the engine words it
  await sql`
    insert into flow_run (tenant_id, flow, trigger, status, finished_at, result)
    values (${tenant}, 'read-scan', 's42: class scan.pdf', 'ok', now(),
            ${sql.json({ copies: [{ copy: 3, pages: [5], code: QR.Chetan, child_id: kids.Chetan, answers: 1, lacks: ["page 2 is not in the file"] }] })})`;
  // printed, and Chetan not said to be away, whichever test ran before: the newest word stands
  await sql`update sheet_instance set print_status = 'printed', approved_by = 'e2e', approved_at = now(), printed_at = now()
            where qr_code in ${sql(Object.values(QR))} and print_status = 'new'`;
  await sql`
    insert into flow_run (tenant_id, flow, trigger, status, finished_at, request)
    values (${tenant}, 'absent', 'e2e: back', 'ok', now(), ${sql.json({ qr: QR.Chetan, away: false, by: "e2e" })})`;
  await page.goto(card("practice"));
  const flag = page.getByRole("alert", { name: "To photograph again" });
  await expect(flag).toContainText("Roll 3: page 2 is not in the file");
  // a paper not back is listed by roll; away, it is carried; back, it is missing again
  await expect(page.getByTestId("in")).toHaveText(/missing: [^·]*roll 3/);
  const chetan = copy(page, ROLL.Chetan);
  await chetan.getByRole("button", { name: "Away: hold it for later" }).click();
  await expect(page.getByTestId("in")).toHaveText(/away, held for later: roll 3/);
  await chetan.getByRole("button", { name: "Back: count as missing" }).click();
  await expect(page.getByTestId("in")).toHaveText(/missing: [^·]*roll 3/);
});

test("papers put in without Given on are read, and the card says it was given", async ({ page }) => {
  await aReadPaper(sql, { qr: code("B1"), child: kids.Asha, template: ws.id, items: ws.item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "correct", read: "2" }] });
  await page.goto(card("assessment"));
  await expect(page.getByTestId("given")).toHaveText("Papers are in, so it was given; no one said the day.");
  await expect(page.getByTestId("in")).toHaveText(/1 of 2 in · missing: roll 2/);
  // the paper in is read and settled: signing it off is what is next, while Bina's is still out (above)
  await expect(next(page)).toHaveText("To sign off. Sign off 1 paper.");
});

test("while a file is read the card says page n of N and about how long", async ({ page }) => {
  await sql`
    insert into flow_run (tenant_id, flow, trigger, status, started_at, result)
    values (${tenant}, 'read-scan', 's42: reading.pdf', 'running', now() - interval '2 minutes',
            jsonb_build_object('pages', 20, 'read', jsonb_build_object('pages', 7, 'of', 20, 'at', now())))`;
  try {
    await page.goto(card("assessment"));
    await expect(page.getByTestId("reading")).toHaveText(/Reading a file now: page 7 of 20, about 4 minutes left\./);
  } finally {
    await sql`update flow_run set status = 'ok', finished_at = now() where flow = 'read-scan' and trigger = 's42: reading.pdf'`;
  }
});

test("each child's paper has its status chip", async ({ page }) => {
  await page.goto(card("practice"));
  const rows = page.locator('section[aria-label$=" copies"]:not([data-spares]) tbody tr');
  await expect(rows.first()).toBeVisible();
  // every row says where it is in the one chip, icon and word
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await expect(rows.locator('td[data-label="State"] [data-status]')).toHaveCount(n);
  for (const chip of await rows.locator('td[data-label="State"] [data-status]').all()) await expect(chip.locator("svg")).toHaveCount(1);
});
