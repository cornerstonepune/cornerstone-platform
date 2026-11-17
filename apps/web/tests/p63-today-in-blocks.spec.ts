/**
 * CP-63 — Today in blocks (specs/CP-63/spec.md). Nimish, 16 Nov 2026: "Today is a line-item list; it should be different sections. One section
 * where I know exactly what I teach today ... I click and the timetable opens for that day showing all periods ... For assessments, two or three
 * things: if I have to check papers, cards." One test per "Done when" line. The educator's day is a class of the spec's own (section P63, grade G8)
 * on days far from any other spec's: Monday 7 April 2031 opens Fortnight 91 with two lessons. The paper cards are the school's (the coordinator
 * the tests sign in as), for an assessment of the spec's own, in a week later than any other's so it is the first card.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { k2Class } from "./k2-rows";
import { timetableSwitch } from "./educator-screens";
import { aPerson, aReadPaper, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1000 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G8";
const LESSONS = "2031-04-07";
const EDUCATOR = { email: "p63-educator@cornerstone.test", name: FAKE_STAFF[5], role: "educator", classes: [], subjects: [] };
const ACTIVITY = { first: "P63 counting in tens", second: "P63 story circle" };
const ids = { klass: "", first: "", second: "" };
const PAPER_CLASS = "P63";
const PAPER_WEEK = "2031-W20";
let wasTimetable = false;

const as = async (browser: Browser, email: string): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test.beforeAll(async () => {
  const [had] = await sql<{ id: string }[]>`select id from school_class where section = 'P63' and grade_code = ${GRADE} limit 1`;
  const klass = had?.id ?? (await k2Class(sql, "P63")).klass;
  ids.klass = klass;
  // an academic year of its own: a frozen fortnight in the shared year makes the engine's timetable loader refuse every other spec's load into it
  const [{ tenant, campus }] = await sql<{ tenant: string; campus: string }[]>`select tenant_id as tenant, campus_id as campus from school_class where id = ${klass}`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2035-36', '2031-04-01', '2031-06-30')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  await sql`update school_class set grade_code = ${GRADE}, academic_year_id = ${year} where id = ${klass}`;
  await sql`insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state) values (${tenant}, ${year}, 91, 'teaching', ${LESSONS}, '2031-04-20', 'frozen')
    on conflict (tenant_id, academic_year_id, starts_on) do update set number = 91, kind = 'teaching', state = 'frozen'`;
  const [{ id: on }] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind, note) values (${tenant}, ${campus}, ${LESSONS}::date, 'teaching', null)
    on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind, note = excluded.note returning id`;
  for (const [code, name] of [["P63-ACT-1", ACTIVITY.first]])
    await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${code}, ${GRADE}, 'Maths', ${name}, '') on conflict (tenant_id, code) do update set name = excluded.name`;
  const lesson = async (starts: string, ends: string, ord: number, subject: string, activity: string | null) => {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${ends}::time, ${`P63 period ${ord}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label, ends_at = excluded.ends_at returning id`;
    return (await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${klass}, ${on}, ${p.id}, ${subject}, 'subject', 'planned', true, ${`P63 lesson ${ord}`}, ${activity})
      on conflict (school_class_id, school_day_id, period_id) do update set state = 'planned', subject_code = excluded.subject_code, activity_code = excluded.activity_code returning id`)[0].id;
  };
  ids.first = await lesson("11:00", "11:40", 9101, "math", "P63-ACT-1");
  ids.second = await lesson("11:40", "12:20", 9102, "english", null);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 3, 'p63 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass})`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
  await timetableSwitch(sql, true);

  // the class's papers: an assessment of the spec's own with two answers waiting for a person, on a child of the class (k2Class enrols 22)
  const [kid] = await sql<{ id: string }[]>`select id from child_now where tenant_id = ${tenant} and section = ${PAPER_CLASS} and roll_no = '1' limit 1`;
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template where source = 'library' and retired_at is null and band = 'G3' and array_length(item_ids, 1) >= 3 order by code limit 1`;
  if (!ws) throw new Error("needs a library worksheet of three items or more for Grade 3");
  await sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${tenant}, 'CS63B001', ${ws.id}, ${kid.id}, to_date(${PAPER_WEEK}, 'IYYY-"W"IW'), ${PAPER_CLASS}, 'assessment', 'printed', 'p63', now()
    where not exists (select 1 from sheet_instance where qr_code = 'CS63B001')`;
  const waits = { status: "needs_teacher", read: "7", why: "under the confidence floor" } as const;
  await aReadPaper(sql, { qr: "CS63B001", child: kid.id, template: ws.id, items: ws.item_ids.slice(0, 3), reads: [waits, waits, { status: "correct", key: true }] });
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasTimetable);
  await sql.end();
});

const blocks = (page: Page) => page.locator("main [data-today-block]");

test("Today shows the blocks in this order: teach, papers to check, notes to confirm, what else waits", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  await expect(page.locator("main [data-today-block=teach]")).toBeVisible();
  expect(await blocks(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-today-block")))).toEqual(["teach", "papers", "notes", "else"]);
  const heads = await blocks(page).evaluateAll((els) => els.map((e) => e.querySelector("h2")?.textContent));
  expect(heads[0]).toContain("Teach");
  expect(heads.slice(1)).toEqual(["Papers to assess", "Notes to confirm", "Anything else waiting"]);
  await page.context().close();
});

test("a click on a period opens that lesson in the timetable's panel, for that day", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  const first = page.locator("main [data-block=PeriodRow] .b-prow").first();
  await expect(first).toContainText("P63");
  await expect(page.locator("main [data-block=PeriodRow] .b-prow").nth(1)).toContainText("no activity yet");
  await first.click();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?.*view=day.*day=${LESSONS}.*open=lesson(%3A|:)${ids.first}`));
  await expect(page.locator("[data-block=DetailPanel] [data-panel-title]")).toHaveText(ACTIVITY.first);
  await page.context().close();
});

test("the teach block opens the timetable for the day, all its periods", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  await page.locator("main [data-today-block=teach] [data-block-more]").click();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?.*view=day.*day=${LESSONS}`));
  await page.context().close();
});

test("each paper to check is one small card whose button opens its check page", async ({ browser }) => {
  // the educator reads her own class's papers only: this one, and nothing of another class
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  const cards = page.locator("[data-today-block=papers] [data-paper-card]");
  await expect(cards).toHaveCount(1);
  await expect(cards.locator("[data-waiting]")).toHaveText("2 answers to judge");
  await expect(cards.getByRole("link")).toHaveCount(1);
  // the board is the menu's Assessments line, not a second link inside the section
  await expect(page.locator("[data-today-block=papers] [data-block-more]")).toHaveCount(0);
  await cards.locator("[data-paper-check]").click();
  await expect(page).toHaveURL(new RegExp(`/children/assessments/[^/]*${PAPER_CLASS}[^/]*/\\d+$`));
  await expect(page.getByRole("heading", { name: "Check the answers" })).toBeVisible();
  await page.context().close();
});

test("the coordinator's Today has the same blocks over the school's papers", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator("main [data-today-block=papers] [data-paper-card]").first()).toBeVisible();
  await expect(page.locator("main [data-today-block=papers] [data-block-more]")).toHaveText("See all assessments");
  await expect(page.locator("main [data-today-block=notes]")).toBeVisible();
});

test("a block with nothing in it says so in words", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  // the class's one paper put away, as a paper made in error is: nothing waits to check
  await sql`update sheet_instance set print_status = 'void' where qr_code = 'CS63B001'`;
  try {
    await page.goto(`/today?day=${LESSONS}`);
    await expect(page.locator("[data-today-block=papers]")).toContainText("No paper waits for you to check.");
    await expect(page.locator("[data-today-block=notes]")).toContainText("No note waits for you to confirm.");
  } finally {
    await sql`update sheet_instance set print_status = 'printed' where qr_code = 'CS63B001'`;
  }
  await page.context().close();
});
