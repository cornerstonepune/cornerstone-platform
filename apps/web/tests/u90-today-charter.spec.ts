/**
 * U90 — Today as the page charter draws it (docs/frontend/page-charter.md B1, B1b, and Part C's "What needs doing → merge into Today
 * (coordinator)"). One test per charter line. The educator's day is a class of the spec's own (section U90, grade G8, which no other spec
 * gives periods) on days far from any other spec's: Monday 10 March 2031 opens Fortnight 90 of the class's year with two lessons, and
 * Thursday 6 March is a holiday before it. The page takes the day in its address, so no test needs the clock. Names are from fake-names.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { menu } from "./menu";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { k2Class, voiceSwitch } from "./k2-rows";
import { timetableSwitch } from "./educator-screens";
import { aPerson, personAsStored } from "./rows";
import { dayMarks } from "../lib/today";
import type { Period } from "../lib/educator/types";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G8";
const LESSONS = "2031-03-10";
const HOLIDAY = "2031-03-06";
const EDUCATOR = { email: "u90-educator@cornerstone.test", name: FAKE_STAFF[4], role: "educator", classes: [], subjects: [] };
const ACTIVITY = { done: "U90 counting in tens", next: "U90 story circle" };
const ids = { klass: "", done: "", next: "" };
let wasTimetable = false;
let wasVoice = { screens: false, recording: false };

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const blocks = (page: Page) => page.locator("main [data-block=PeriodRow] .b-prow");
const panelTitle = (page: Page) => page.locator("[data-block=DetailPanel] [data-panel-title]");

test.beforeAll(async () => {
  // made as a K2 class once, then moved to the spec's own grade: a second run finds it by its section
  const [had] = await sql<{ id: string }[]>`select id from school_class where section = 'U90' and grade_code = ${GRADE} limit 1`;
  const klass = had?.id ?? (await k2Class(sql, "U90")).klass;
  ids.klass = klass;
  // an academic year of its own: a frozen fortnight in the shared 2031-32 year makes the engine's timetable loader refuse every other spec's
  // load into it (u75, u82), and only the order the specs run in kept them apart
  const [{ tenant, campus }] = await sql<{ tenant: string; campus: string }[]>`select tenant_id as tenant, campus_id as campus from school_class where id = ${klass}`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2036-37', '2031-03-01', '2031-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  await sql`update school_class set grade_code = ${GRADE}, academic_year_id = ${year} where id = ${klass}`;
  await sql`insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state) values (${tenant}, ${year}, 90, 'teaching', ${LESSONS}, '2031-03-23', 'frozen')
    on conflict (tenant_id, academic_year_id, starts_on) do update set number = 90, kind = 'teaching', state = 'frozen'`;
  const day = async (on: string, kind: string, note: string | null) =>
    (await sql<{ id: string }[]>`insert into school_day (tenant_id, campus_id, on_date, kind, note) values (${tenant}, ${campus}, ${on}::date, ${kind}, ${note})
      on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind, note = excluded.note returning id`)[0].id;
  await day(HOLIDAY, "holiday", "U90 holiday");
  const on = await day(LESSONS, "teaching", null);
  for (const [code, name] of [["U90-ACT-DONE", ACTIVITY.done], ["U90-ACT-NEXT", ACTIVITY.next]])
    await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${code}, ${GRADE}, 'Maths', ${name}, '') on conflict (tenant_id, code) do update set name = excluded.name`;
  const lesson = async (starts: string, ends: string, ord: number, subject: string, activity: string, state: string) => {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${ends}::time, ${`U90 period ${ord}`}, false)
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set label = excluded.label, ends_at = excluded.ends_at returning id`;
    return (await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${klass}, ${on}, ${p.id}, ${subject}, 'subject', ${state}, true, ${`U90 lesson ${ord}`}, ${activity})
      on conflict (school_class_id, school_day_id, period_id) do update set state = excluded.state, subject_code = excluded.subject_code, activity_code = excluded.activity_code returning id`)[0].id;
  };
  ids.done = await lesson("09:00", "09:40", 9001, "math", "U90-ACT-DONE", "done");
  ids.next = await lesson("09:40", "10:20", 9002, "english", "U90-ACT-NEXT", "planned");
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 3, 'u90 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass})`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
  await timetableSwitch(sql, true);
  // the school's Today reads its counts from the engine's /k2/today-school, which answers 403 while voice notes are switched off (a fresh copy has them
  // off): the right side then has nothing to show and its summary is empty. The spec switches them on for its run and puts them back, as m1-04 does.
  const [v] = await sql<{ screens: boolean; recording: boolean }[]>`
    select coalesce((select value = 'true'::jsonb from config where key = 'voice.screens_enabled'), false) as screens,
           coalesce((select value = 'true'::jsonb from config where key = 'voice.recording_enabled'), false) as recording`;
  wasVoice = v;
  await voiceSwitch(sql, true, v.recording);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasTimetable);
  await voiceSwitch(sql, wasVoice.screens, wasVoice.recording);
  await sql.end();
});

// ---- B1. Today (educator) ----

test("B1 primary action: 'Open my next lesson' opens the lesson now or next, on its own page", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  const go = page.getByRole("link", { name: "Open my next lesson" });
  await expect(go).toHaveAttribute("href", `/period/${ids.next}`);
  await go.click();
  await expect(page).toHaveURL(new RegExp(`/period/${ids.next}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(ACTIVITY.next);
  await page.context().close();
});

test("B1 left: the day's lessons are the strip at the top, then Teach today, Papers to assess and Notes to confirm as sections that open and close, each counted once", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  // the strip is first, above every section; no stat tiles repeat what the sections say
  await expect(page.locator("main [data-block=StatTiles]")).toHaveCount(0);
  const [strip, first] = await Promise.all([blocks(page).first().boundingBox(), page.locator("main [data-today-block]").first().boundingBox()]);
  expect(strip!.y).toBeLessThan(first!.y);
  const heads = await page.locator("main [data-today-block] > summary h2").allTextContents();
  expect(heads.slice(0, 3)).toEqual(["Teach on Monday 10-Mar", "Papers to assess", "Notes to confirm"]);
  expect(await blocks(page).count()).toBe(2);
  // a section closes on its summary
  const teach = page.locator("main [data-today-block=teach]");
  await expect(teach).toHaveAttribute("open", "");
  await teach.locator("summary").click();
  await expect(teach).not.toHaveAttribute("open", "");
  // the notes count is the bar's one count (Today's badge), none when nothing waits
  const notes = (await page.locator("[data-today-count=notes]").count()) ? Number((await page.locator("[data-today-count=notes]").innerText()).replace(/\D/g, "")) : 0;
  const badge = (await menu(page)).getByRole("link", { name: /^Today/ }).getByTestId("waiting");
  if (notes) await expect(badge).toHaveText(String(notes));
  else await expect(badge).toHaveCount(0);
  await page.context().close();
});

test("B1 left: the lessons are a timeline of subject-coloured blocks in time order, each with time, subject, activity name and done / now / next", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  await expect(page.locator("main [data-block=PeriodRow][data-tinted]")).toHaveCount(1);
  await expect(blocks(page)).toHaveCount(2);
  const times = await blocks(page).locator(".b-t").allTextContents();
  expect(times).toEqual(["09:00–09:40", "09:40–10:20"]);
  // the subject's colour is the school's own row (config timetable.subject_looks: math numeracy, english language), with its word beside it
  await expect(blocks(page).nth(0)).toHaveAttribute("data-subject", "numeracy");
  await expect(blocks(page).nth(0)).toContainText("Numeracy");
  await expect(blocks(page).nth(1)).toHaveAttribute("data-subject", "language");
  await expect(blocks(page).nth(1)).toContainText("Language");
  await expect(blocks(page).nth(0).locator("b")).toHaveText(ACTIVITY.done);
  await expect(blocks(page).nth(1).locator("b")).toHaveText(ACTIVITY.next);
  // done from what was recorded, next for the first still to come; the rest carry no chip
  await expect(blocks(page).nth(0).locator("[data-block=StatusChip]")).toContainText("done");
  await expect(blocks(page).nth(1).locator("[data-block=StatusChip]")).toContainText("next");
  await page.context().close();
});

test("B1 marks: the lesson running now is 'now', the first one after it 'next', a recorded one 'done'; a day gone by has no now or next", () => {
  const p = (id: string, starts_at: string, ends_at: string, state: Period["state"] = "planned"): Period => ({ period_id: id, starts_at, ends_at, label: id, name: id, fixed: false, kind: "subject", subject: "math", text: "", line: null, state, activity: null });
  const day = [p("a", "09:00", "09:40", "done"), p("b", "09:40", "10:20"), p("c", "10:20", "11:00"), p("d", "11:00", "11:40")];
  expect(dayMarks(day, "09:50", "today")).toEqual({ marks: { a: "done", b: "now", c: "next" }, chosen: "b" });
  expect(dayMarks(day, "08:00", "today")).toEqual({ marks: { a: "done", b: "next" }, chosen: "b" });
  // after the day: nothing now or next, and the panel opens on the last lesson begun
  expect(dayMarks(day, "15:00", "today")).toEqual({ marks: { a: "done" }, chosen: "d" });
  expect(dayMarks(day, "09:50", "past")).toEqual({ marks: { a: "done" }, chosen: "d" });
  expect(dayMarks(day, "09:50", "future")).toEqual({ marks: { a: "done", b: "next" }, chosen: "b" });
});

test("B1 right: choosing a lesson opens it in the timetable's own panel, for that day (CP-63)", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  await blocks(page).nth(0).click();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?.*view=day.*day=${LESSONS}.*open=lesson(%3A|:)${ids.done}`));
  await expect(panelTitle(page)).toHaveText(ACTIVITY.done);
  await expect(page.locator("[data-block=DetailPanel] [role=tab]")).toHaveText(["Activity", "Children", "Materials", "History"]);
  await expect(page.locator("[data-block=DetailPanel] [data-panel-full]")).toHaveAttribute("href", `/period/${ids.done}`);
  await page.context().close();
});

test("B1 right: with nothing chosen the panel opens on the lesson now or next", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${LESSONS}`);
  await expect(panelTitle(page)).toHaveText(ACTIVITY.next);
  await page.context().close();
});

test("B1 holiday: the next school day's lessons are shown, under one line that says it is a holiday and when the fortnight starts", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto(`/today?day=${HOLIDAY}`);
  await expect(page.locator("main [data-day-note]")).toHaveText("No sessions on this day. Holiday: U90 holiday. Fortnight 90 starts Monday 10-Mar.");
  await expect(blocks(page)).toHaveCount(2);
  await expect(page.locator("main [data-block=PeriodRow]")).toHaveAttribute("aria-label", "Lessons on Monday 10-Mar");
  await expect(blocks(page).nth(1).locator("[data-block=StatusChip]")).toContainText("next");
  await page.context().close();
});

// ---- B1b. Today (coordinator) ----

const rowsOf = (page: Page) => page.locator("main [data-waiting] > li");
/** The coordinator's Today, once its list (or the words saying there is none) has arrived: the page streams. */
const school = async (page: Page) => {
  await page.goto("/today");
  await expect(page.locator("main [data-waiting], main [data-today-block=else] [data-ux=empty]").first()).toBeVisible();
};

test("B1b primary action: 'Open the first' opens the first thing waiting that has its own page", async ({ page }) => {
  await school(page);
  const rows = rowsOf(page);
  if (!(await rows.locator("[data-wait-action]").count())) {
    await expect(page.locator("[data-ux=action]")).toContainText(/Nothing waits on you|could not be read/);
    return;
  }
  const first = await rows.locator("[data-wait-action]").first().getAttribute("href");
  await expect(page.locator("[data-ux=action] a")).toHaveAttribute("href", first!);
  await expect(page.locator("[data-ux=action] a")).toContainText("Open the first:");
});

test("B1b: the school's Today counts its notes once, in its section, and the bar's badge says the same", async ({ page }) => {
  await school(page);
  await expect(page.locator('main [data-block=StatTiles][aria-label="The school today in numbers"]')).toHaveCount(0);
  const heads = await page.locator("main [data-today-block] > summary h2").allTextContents();
  expect(heads).toEqual(["Papers to assess", "Notes to confirm", "Anything else waiting"]);
  const late = (await page.locator("[data-today-count=notes]").count()) ? Number((await page.locator("[data-today-count=notes]").innerText()).replace(/\D/g, "")) : 0;
  const badge = (await menu(page)).getByRole("link", { name: /^Today/ }).getByTestId("waiting");
  if (late) await expect(badge).toHaveText(late.toLocaleString("en-IN"));
  else await expect(badge).toHaveCount(0);
});

test("B1b waiting on you: compact rows, one action each, holding every kind of work What needs doing lists (skills to approve aside)", async ({ page }) => {
  // every kind of work waiting (lib/todo.ts sectionsOf over the person's tasks), each a row of Today with its own count
  await school(page);
  const groups = await page.locator("main [data-waiting] [data-row^='group-']").evaluateAll((els) => els.map((e) => ({ key: e.getAttribute("data-row")!.slice("group-".length), n: Number((e.querySelector("[data-many]") as HTMLElement).innerText.replace(/\D/g, "")) })));
  expect(groups.length, "kinds of work wait").toBeGreaterThan(0);
  for (const g of groups.filter((x) => x.key !== "skills")) {
    const row = page.locator(`main [data-row="group-${g.key}"]`);
    await expect(row, `the group ${g.key} is a row of Today`).toHaveCount(1);
    expect(Number((await row.locator("[data-many]").innerText()).replace(/\D/g, ""))).toBe(g.n);
  }
  await expect(page.locator("main [data-row=group-skills]")).toHaveCount(0);
  for (const row of await rowsOf(page).all()) {
    expect(await row.locator("[data-wait-action]").count()).toBeLessThanOrEqual(1);
    expect(await row.locator("[data-block=StatusChip]").count()).toBe(1);
    // compact: one line of words and one of facts, never a table
    expect((await row.boundingBox())!.height).toBeLessThan(100);
  }
  await expect(page.locator("main [data-waiting] table")).toHaveCount(0);
});

test("B1b right: a row opens on the right with the rows behind it, each with its own action; closing returns to the list", async ({ page }) => {
  await school(page);
  const open = rowsOf(page).locator("[data-wait-open]").first();
  if (!(await open.count())) return void (await expect(page.locator("main")).toContainText("Nothing waits on you."));
  const what = (await open.locator("b").innerText()).trim();
  await open.click();
  await expect(page).toHaveURL(/open=wait/);
  await expect(panelTitle(page)).toHaveText(what);
  await expect(page.locator("[data-block=DetailPanel] [role=tab]")).toHaveText(["What waits"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-block=DetailPanel][data-panel=summary]")).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
});

test("Part C: What needs doing's own address answers 308 to Today, where its kinds of work are", async ({ page }) => {
  const res = await page.request.get("/setup/needs-doing?kind=taught", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toBe("/today?kind=taught");
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
  await expect(page.locator("main [data-today-block=else] > summary h2")).toHaveText("Anything else waiting");
});
