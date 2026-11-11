/**
 * U76 (UI-4b, PR 2) — what the old approve page and card did that the assessment screen now does, carried across with the same
 * assertions (the old spec names are in docs/notes/UI-4b.md): a child's level changed before print, with the reason, kept as an override;
 * and refused with no reason. A class and a week of the test's own, built the way the n8n flow builds a week (prescribe, then assemble),
 * and removed afterwards (nothing in it was printed or read).
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { ENGINE_PORT } from "../playwright.config";
import { assessmentHref } from "../lib/assessment-ui";
import { aClass } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U76-CLASS";
const WEEK = "2091-W35"; // an ISO week of its own
const KEY = `practice~${SECTION}~${WEEK}~SUB.2D2D`;

async function engine(path: string, body: object) {
  const r = await fetch(`http://127.0.0.1:${ENGINE_PORT}${path}`, {
    method: "POST",
    headers: { "X-Engine-Key": process.env.E2E_ENGINE_KEY!, "content-type": "application/json", "Idempotency-Key": `u76-${path}-${Date.now()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function clearUp() {
  await sql`delete from item_exposure where week = to_date(${WEEK}, 'IYYY-"W"IW')`;
  await sql`delete from prescription where week = to_date(${WEEK}, 'IYYY-"W"IW')`;
  await sql`delete from sheet_instance where week = to_date(${WEEK}, 'IYYY-"W"IW')`;
}

test.beforeAll(async () => {
  await aClass(sql, SECTION, "G2", ["Anya", "Bilal", "Chitra", "Dhruv"]);
  await clearUp();
  await engine("/week/prescribe", { section: SECTION, week: WEEK, skill_set: "SUB.2D2D" });
  const built = await engine("/week/assemble", { section: SECTION, week: WEEK });
  expect(built.short, "every child in the class is given a worksheet").toEqual([]);
});
test.afterAll(async () => {
  await clearUp();
  await sql.end();
});

const rowOf = (page: import("@playwright/test").Page, roll: string) => page.locator("tr", { has: page.getByLabel(`Level for Sr. No. ${roll}`) });
const prescription = async (roll: string) =>
  (
    await sql<{ id: string; difficulty: string; rule_fired: string; override_reason: string | null }[]>`
      select p.id, p.difficulty, p.rule_fired, p.override_reason from prescription p join child_now c on c.id = p.child_id
      where c.section = ${SECTION} and p.week = to_date(${WEEK}, 'IYYY-"W"IW') and c.roll_no = ${roll}`
  )[0];

test("changing one child's level writes the reason and survives the next prescribe", async ({ page }) => {
  const before = await prescription("1");
  try {
    await page.goto(assessmentHref(KEY));
    const row = rowOf(page, "1");
    await row.getByLabel("Level for Sr. No. 1").selectOption("Easy");
    await row.getByLabel("Why Sr. No. 1 changes level").fill("she was away all week");
    await row.getByRole("button", { name: "Change this child" }).click();
    await expect(page.getByRole("status")).toContainText("Changed");

    const after = await prescription("1");
    expect(after.difficulty).toBe("Easy");
    expect(after.rule_fired).toBe("override");
    expect(after.override_reason).toBe("she was away all week");
    await expect(rowOf(page, "1")).toContainText("she was away all week");
  } finally {
    await sql`update prescription set difficulty = ${before.difficulty}, rule_fired = ${before.rule_fired},
              override_by = null, override_reason = null where id = ${before.id}`;
  }
});

test("a level change with no reason is refused and nothing moves", async ({ page }) => {
  const before = await prescription("2");
  await page.goto(assessmentHref(KEY));
  const row = rowOf(page, "2");
  await row.getByLabel("Level for Sr. No. 2").selectOption("Advance");
  await row.getByRole("button", { name: "Change this child" }).click();
  // the browser's own required-field check stops it; the row is untouched either way
  const after = await prescription("2");
  expect(after.difficulty).toBe(before.difficulty);
  expect(after.rule_fired).toBe(before.rule_fired);
});

// ---- Given on, who was away, and the page to photograph again (the old card's words) ----
// A class of its own with a practice paper for three children and a spare, printed, whose papers a person then says were given out.
test.describe("the card's words", () => {
  const CARD = "U76B-CLASS";
  const RUN = randomBytes(2).toString("hex").toUpperCase();
  const code = (n: string) => `CS${RUN}${n}`;
  const QR = { Asha: code("A1"), Bina: code("A2"), Chetan: code("A3"), spare: code("AF") };
  let kids: Record<string, string> = {};
  let ws: { id: string; item_ids: string[]; set: string };
  let week = "";
  let tenant = "";
  const here = () => assessmentHref(["practice", CARD, week, ws.set].join("~"));
  const said = (page: Page) => page.getByTestId("in");

  test.beforeAll(async () => {
    kids = await aClass(sql, CARD, "G2", ["Asha", "Bina", "Chetan"]);
    [{ tenant, week }] = await sql<{ tenant: string; week: string }[]>`
      select tenant_id as tenant, to_char(now(), 'IYYY-"W"IW') as week from child_now where id = ${kids.Asha}`;
    [ws] = await sql<{ id: string; item_ids: string[]; set: string }[]>`
      select t.id, t.item_ids, t.skill_set_code as set from sheet_template t
      where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 2 order by t.code limit 1`;
    await sql`update sheet_instance set print_status = 'void' where section = ${CARD} and qr_code not like ${`CS${RUN}%`}`;
    for (const [who, qr] of Object.entries(QR)) {
      await sql`
        insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
        values (${tenant}, ${qr}, ${ws.id}, ${who === "spare" ? null : kids[who]}, ${CARD}, to_date(${week}, 'IYYY-"W"IW'), 'practice', 'printed', 'e2e', now(), now())`;
    }
  });
  test.afterAll(async () => {
    await sql`delete from flow_run where flow = 'read-scan' and trigger like 'u76:%'`;
    await sql`update sheet_instance set print_status = 'void' where section = ${CARD} and print_status <> 'void'`;
  });

  test("a person says the day the papers were given, and the screen says it and who is missing", async ({ page }) => {
    await page.goto(here());
    await expect(page.getByTestId("given")).toHaveText("Not said to be given yet.");
    await expect(said(page)).toHaveText(/0 of 3 in · missing: roll 1, roll 2, roll 3/);
    await page.getByLabel("Day it was given").fill(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    await page.getByRole("button", { name: "Given on" }).click();
    await expect(page.getByTestId("given")).toContainText("Given on");
    await expect(page.getByTestId("given")).toContainText("said by");
  });

  test("a child away is carried and a child back is missing again; a page to photograph again is flagged", async ({ page }) => {
    // the newest file holding Chetan's copy lacked its second page, as the engine words it
    await sql`
      insert into flow_run (tenant_id, flow, trigger, status, finished_at, result)
      values (${tenant}, 'read-scan', 'u76: class scan.pdf', 'ok', now(),
              ${sql.json({ copies: [{ copy: 3, pages: [5], code: QR.Chetan, child_id: kids.Chetan, answers: 1, lacks: ["page 2 is not in the file"] }] })})`;
    // not said to be away, whichever test ran before: the newest word stands
    await sql`
      insert into flow_run (tenant_id, flow, trigger, status, finished_at, request)
      values (${tenant}, 'absent', 'e2e: back', 'ok', now(), ${sql.json({ qr: QR.Chetan, away: false, by: "e2e" })})`;
    await page.goto(here());
    await expect(page.getByRole("alert", { name: "To photograph again" })).toContainText("Roll 3: page 2 is not in the file");
    await expect(said(page)).toHaveText(/missing: [^·]*roll 3/);
    // a copy is a row by its Sr. No. (3), never by a name
    const chetan = page.locator("tr", { has: page.locator("td", { hasText: /^3$/ }) });
    await chetan.getByRole("button", { name: "Away: hold it for later" }).click();
    await expect(said(page)).toHaveText(/away, held for later: roll 3/);
    await expect(chetan).toContainText("Away, held for later");
    await chetan.getByRole("button", { name: "Back: count as missing" }).click();
    await expect(said(page)).toHaveText(/missing: [^·]*roll 3/);
  });
});
