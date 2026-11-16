/**
 * U94 (CP-48 Done when 10, issue #736) — what the machine made carries one symbol and every list filters by origin; the "drafted, to check"
 * queue is gone and anyone edits directly. One test per clause of the line:
 *   1. on Curriculum, an activity's page, the lesson panel and the timetable, anything with origin "machine" shows one machine symbol;
 *   2. each list can be filtered by origin: sheet / machine / person;
 *   3. the "drafted parts wait for a person", "Check the drafted parts" and "n drafted to check" wording and chips are gone;
 *   4. there is no queue; anyone edits directly.
 * The rows are the spec's own (tests/u94-rows.ts); the timetable stands on the U74 class and fortnight (tests/timetable-rows.ts), one of
 * its lessons linked to the machine's activity for the run and put back after. Its educator is named from tests/fake-names.ts.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { gate } from "./m1-13-rows";
import { aPerson, personAsStored } from "./rows";
import { HERE, timetableRows, type Fixture } from "./timetable-rows";
import { LO_MACHINE, LO_SHEET, MACHINE, NAMES, PERSON, SHEET, u94Rows } from "./u94-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u94-educator@cornerstone.test", name: FAKE_STAFF[4], role: "educator", classes: [], subjects: [] };
const LIST = 'table[aria-label="Activities and skills"]';
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");
let f: Fixture;
let lesson = "";

const educatorPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test.beforeAll(async () => {
  await u94Rows(sql);
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  // one lesson of the U74 class whose plan line the machine linked to the machine's activity (plan_entry.link_rule 'model')
  const [s] = await sql<{ id: string }[]>`
    select s.id::text from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass} and d.on_date = ${f.days[1]}::date and s.period_id = ${f.periods[1].id}`;
  lesson = s.id;
  // as a model run links it (`link_run` set): an activity changed with no run is a person's (the plan_entry_link_by_hand trigger)
  await sql`update plan_entry set activity_id = (select id from activity where code = ${MACHINE}), link_rule = 'model', link_run = gen_random_uuid() where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1'`;
  await sql`update session set plan_entry_id = (select id from plan_entry where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1') where id = ${lesson}`;
});
test.beforeEach(async () => {
  await gate(sql, "open"); // the educator switch on: the timetable shows, and the curriculum's gate lets every member of staff in
});
test.afterAll(async () => {
  await sql`update session set plan_entry_id = null where id = ${lesson}`;
  await sql`update plan_entry set activity_id = null, link_rule = null where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1'`;
  await gate(sql, "closed");
  await sql.end();
});

/** The one machine symbol: the same mark, the same icon, wherever it is drawn. */
async function oneSymbol(marks: ReturnType<Page["locator"]>) {
  await expect(marks.first()).toBeVisible();
  for (const m of await marks.all()) {
    await expect(m.locator("[data-icon]")).toHaveAttribute("data-icon", "from-draft");
    await expect(m).toHaveAttribute("title", "Made by the machine");
  }
}

test("1 · Curriculum, an activity's page, the lesson panel and the timetable mark what the machine made with one symbol", async ({ page }) => {
  // Curriculum: the machine's activity carries it; the sheet's does not
  await page.goto("/setup/curriculum?q=U94");
  await oneSymbol(page.locator(`${LIST} tr[data-row="${MACHINE}"] [data-machine]`));
  await expect(page.locator(`${LIST} tr[data-row="${SHEET}"] [data-machine]`)).toHaveCount(0);
  // its panel: beside the title, on the part the machine drafted, and on the objective and skill it linked
  await page.locator(`[data-open-key="activity:${MACHINE}"]`).click();
  await expect(page).toHaveURL(new RegExp(`open=activity%3A${MACHINE}|open=activity:${MACHINE}`));
  await oneSymbol(panel(page).locator("[data-panel-line] [data-machine]"));
  await oneSymbol(panel(page).locator('[data-part="thinking"] [data-machine]'));
  await expect(panel(page).locator('[data-part="objective"] [data-machine]')).toHaveCount(0);
  // the activity's own page: the same marks
  await page.goto(`/setup/activities/${MACHINE}?tab=objectives`);
  await oneSymbol(page.locator(`[data-objective-row]`).filter({ hasText: "U94 counts blocks to ten" }).locator("[data-machine]"));
  await expect(page.locator(`[data-objective-row]`).filter({ hasText: "U94 sorts by size" }).locator("[data-machine]")).toHaveCount(0);
  // the timetable: the block of the lesson the machine linked, and that lesson's panel
  const week = `/timetable?fn=${HERE}&class=${f.klass}&view=week&day=${f.days[1]}`;
  await page.goto(week);
  await oneSymbol(page.locator(`[data-block=FortnightGrid] [data-open-key="lesson:${lesson}"] [data-machine]`));
  await expect(page.locator("[data-block=FortnightGrid] [data-machine]")).toHaveCount(1);
  await page.goto(`${week}&open=lesson:${lesson}`);
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(NAMES[MACHINE]);
  await oneSymbol(panel(page).locator("[data-panel-line] [data-machine]"));
  await oneSymbol(panel(page).getByRole("region", { name: "Watch for" }).locator("[data-machine]"));
});

test("2 · each list filters by origin: sheet, machine or person", async ({ page }) => {
  await page.goto("/setup/curriculum?q=U94");
  const origin = page.locator("[data-block=FilterBar] label", { hasText: "Origin" }).locator("select");
  await expect(origin.locator("option")).toHaveText(["Any origin", "Sheet", "Machine", "Person"]);
  const rows = page.locator(`${LIST} tbody tr[data-row]`);
  await expect(rows).toHaveCount(3);
  for (const [o, has, not] of [["machine", MACHINE, PERSON], ["person", PERSON, MACHINE]] as const) {
    await page.goto(`/setup/curriculum?q=U94&origin=${o}`);
    await expect(page.locator(`${LIST} tr[data-row="${has}"]`)).toHaveCount(1);
    await expect(page.locator(`${LIST} tr[data-row="${not}"]`)).toHaveCount(0);
    for (const r of await rows.all()) await expect(r).toHaveAttribute("data-origins", new RegExp(`\\b${o}\\b`));
  }
  await page.goto("/setup/curriculum?q=U94&origin=sheet");
  await expect(page.locator(`${LIST} tr[data-row="${SHEET}"]`)).toHaveCount(1);
  // choosing it in the row writes it into the address
  await page.goto("/setup/curriculum?q=U94");
  await origin.selectOption("machine");
  await expect(page).toHaveURL(/origin=machine/);
  // the lists of an activity follow it: its parts, its objectives, its skills
  await page.goto(`/setup/activities/${MACHINE}?origin=machine`);
  await expect(page.locator("[data-part][data-origin]")).toHaveCount(1); // the parts (the rubric block is data-part="levels" too)
  await expect(page.locator('[data-part="thinking"]')).toHaveAttribute("data-origin", "machine");
  await page.goto(`/setup/activities/${MACHINE}?origin=sheet&tab=objectives`);
  await expect(page.locator("[data-objective-row]")).toHaveText([/U94 sorts by size/]);
  await page.goto(`/setup/activities/${MACHINE}?origin=machine&tab=skills`);
  await expect(page.locator("[data-skill-link]")).toHaveCount(1);
  await page.goto(`/setup/activities/${MACHINE}?origin=person&tab=skills`);
  await expect(page.locator("[data-skill-link]")).toHaveCount(0);
  // and an objective's: the activities linked to it by the machine, and by none other
  await page.goto(`/setup/objectives/${LO_SHEET}?origin=machine&tab=activities`);
  await expect(page.locator("[data-activity-row]")).toHaveCount(0);
  await page.goto(`/setup/objectives/${LO_MACHINE}?origin=machine&tab=activities`);
  await expect(page.locator("[data-activity-row]")).toHaveText([NAMES[MACHINE]]);
});

const GONE = [/drafted parts? waits? for a person/i, /check the drafted parts/i, /\d+ drafted to check/i, /drafted, to check/i, /drafted, check me/i, /drafts to check/i];

test("3 · the drafted-to-check wording and chips are gone from the pages and from the code that draws them", async ({ page }) => {
  for (const at of ["/setup/curriculum", "/setup/curriculum?q=U94", `/setup/curriculum?open=activity:${MACHINE}`, `/setup/activities/${MACHINE}`, "/setup"]) {
    await page.goto(at);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const text = await page.locator("main").innerText();
    for (const w of GONE) expect(text, `${at}: ${w}`).not.toMatch(w);
  }
  // nor written anywhere a page could draw them from
  const root = path.resolve(__dirname, "..");
  const files = ["app", "components", "lib"].flatMap((d) => readdirSync(path.join(root, d), { recursive: true, encoding: "utf8" }).filter((x) => /\.tsx?$/.test(x)).map((x) => path.join(root, d, x)));
  for (const file of files) for (const w of GONE) expect(readFileSync(file, "utf8"), `${file}: ${w}`).not.toMatch(w);
});

test("4 · no queue: whoever opens a part the machine made edits it in place, and it becomes a person's", async ({ browser, page }) => {
  await page.goto(`/setup/curriculum?q=U94&open=activity:${MACHINE}`);
  // no board of drafts, no Keep, no Send back: only Edit, on the machine's part alone
  await expect(page.getByRole("region", { name: /drafted parts/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Keep|Send back)$/ })).toHaveCount(0);
  await expect(panel(page).locator("[data-answers]")).toHaveCount(1);
  const part = panel(page).locator('[data-part="thinking"]');
  await part.locator("summary", { hasText: "Edit" }).click();
  await part.getByLabel("The idea").fill("U94 a person's idea");
  await part.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`open=activity(%3A|:)${MACHINE}`));
  await expect(panel(page).locator('[data-part="thinking"]')).toHaveAttribute("data-origin", "person");
  await expect(panel(page).locator('[data-part="thinking"] [data-machine]')).toHaveCount(0);
  await expect(panel(page).locator("[data-answers]")).toHaveCount(0);
  const [{ source }] = await sql<{ source: string }[]>`select source from activity_part_source where activity_code = ${MACHINE} and part = 'thinking'`;
  expect(source).toBe("person");
  // anyone: an educator, once the screens are on, has the same Edit on the machine's words
  await u94Rows(sql);
  const edu = await educatorPage(browser);
  await edu.goto(`/setup/activities/${MACHINE}`);
  await expect(edu.locator('[data-part="thinking"] [data-answers] summary')).toHaveText(/Edit/);
  await edu.context().close();
});
