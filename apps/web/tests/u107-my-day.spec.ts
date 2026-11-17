/**
 * U107 — My day (specs/CP-69/spec.md, issue #834): one test per Done-when line. Written before the page (phase 1), so every test is red
 * until phase 2 builds it; the names a test reads (`data-…`) are the page's contract.
 *
 * Its own rows, far from any other spec's: two classes of grade G9 (sections U107A, U107B) in an academic year of their own, three lessons
 * on Monday 7 April 2031 and one on Tuesday 8 April. Three people: a class teacher of U107A, a subject educator of English in both classes,
 * and a coordinator who holds no class. The page takes the day in its address, so no test needs the clock. Names are from fake-names.
 *
 * The address: `/my-day` (the old `/today` still opens it). `day=YYYY-MM-DD`; `open=lesson:<id>` opens a lesson's preparation in place;
 * `period=today|week|month` is the board's time filter; `subject`, `class`, `kind` narrow the cards.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { menu } from "./menu";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aK2Note, k2Class, voiceSwitch } from "./k2-rows";
import { timetableSwitch } from "./educator-screens";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G9";
const MONDAY = "2031-04-07";
const TUESDAY = "2031-04-08";
const NEXT_MONDAY = "2031-04-14";
const TEACHER = { email: "u107-class@cornerstone.test", name: FAKE_STAFF[5], role: "educator", classes: [], subjects: [] };
const ENGLISH = { email: "u107-english@cornerstone.test", name: FAKE_STAFF[6], role: "educator", classes: [], subjects: ["ENG"] };
const COORDINATOR = { email: "u107-coordinator@cornerstone.test", name: FAKE_STAFF[3], role: "coordinator", classes: [], subjects: [] };
// one activity with every part, one with an objective and nothing else: the second must show no empty heading
const FULL = { code: "U107-ACT-FULL", name: "U107 market sums", objective: "U107 adds two prices", steps: "U107 step one\nU107 step two", materials: "U107 paper coins", level_1: "U107 adds with help" };
const BARE = { code: "U107-ACT-BARE", name: "U107 story circle", objective: "U107 retells a story" };
const ids = { a: "", b: "", maths: "", englishA: "", englishB: "", tuesday: "", note: "", done: "" };
let wasTimetable = false;
let wasVoice = { screens: false, recording: false };

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const lessons = (page: Page) => page.locator("[data-my-lessons] [data-lesson]");
const lane = (page: Page, key: "now" | "week" | "ready" | "done") => page.locator(`[data-my-tasks] [data-lane="${key}"]`);
const cards = (page: Page) => page.locator("[data-my-tasks] [data-kcard]");
const param = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

test.beforeAll(async () => {
  const klass = async (section: string) => {
    const [had] = await sql<{ id: string }[]>`select id from school_class where section = ${section} and grade_code = ${GRADE} limit 1`;
    return had?.id ?? (await k2Class(sql, section)).klass;
  };
  ids.a = await klass("U107A");
  ids.b = await klass("U107B");
  const [{ tenant, campus }] = await sql<{ tenant: string; campus: string }[]>`select tenant_id as tenant, campus_id as campus from school_class where id = ${ids.a}`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2037-38', '2031-04-01', '2031-04-30')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  await sql`update school_class set grade_code = ${GRADE}, academic_year_id = ${year} where id in (${ids.a}, ${ids.b})`;
  await sql`insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state) values (${tenant}, ${year}, 91, 'teaching', ${MONDAY}, '2031-04-20', 'frozen')
    on conflict (tenant_id, academic_year_id, starts_on) do update set number = 91, kind = 'teaching', state = 'frozen'`;
  const day = async (on: string) =>
    (await sql<{ id: string }[]>`insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${on}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`)[0].id;
  const [mon, tue] = [await day(MONDAY), await day(TUESDAY)];
  await day(NEXT_MONDAY);
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, steps, materials, level_1)
    values (${tenant}, ${FULL.code}, ${GRADE}, 'Maths', ${FULL.name}, '', ${FULL.objective}, ${FULL.steps}, ${FULL.materials}, ${FULL.level_1})
    on conflict (tenant_id, code) do update set objective = excluded.objective, steps = excluded.steps, materials = excluded.materials, level_1 = excluded.level_1`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no, objective) values (${tenant}, ${BARE.code}, ${GRADE}, 'English', ${BARE.name}, '', ${BARE.objective})
    on conflict (tenant_id, code) do update set objective = excluded.objective, steps = null, materials = null, level_1 = null`;
  const lesson = async (cls: string, on: string, starts: string, ends: string, ord: number, subject: string, activity: string) => {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${ends}::time, ${`U107 period ${ord}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label, ends_at = excluded.ends_at returning id`;
    return (await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${cls}, ${on}, ${p.id}, ${subject}, 'subject', 'planned', true, ${`U107 lesson ${ord}`}, ${activity})
      on conflict (school_class_id, school_day_id, period_id) do update set subject_code = excluded.subject_code, activity_code = excluded.activity_code returning id`)[0].id;
  };
  ids.maths = await lesson(ids.a, mon, "09:00", "09:40", 9101, "NUM", FULL.code);
  ids.englishA = await lesson(ids.a, mon, "09:40", "10:20", 9102, "ENG", BARE.code);
  ids.englishB = await lesson(ids.b, mon, "10:20", "11:00", 9103, "ENG", BARE.code);
  ids.tuesday = await lesson(ids.a, tue, "09:00", "09:40", 9101, "NUM", FULL.code);
  for (const p of [TEACHER, ENGLISH, COORDINATOR]) if (!(await personAsStored(sql, p.email))) await aPerson(sql, p);
  const grant = (email: string, role: string, cls: string, subject: string | null) => sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from, granted_by)
    select ${tenant}, ps.staff_id, ${role}, ${cls}, ${subject}, current_date - 3, 'u107 test' from pii.staff ps
    where ps.email = ${email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${cls})`;
  await grant(TEACHER.email, "class_teacher", ids.a, null);
  await grant(ENGLISH.email, "subject_educator", ids.a, "ENG");
  await grant(ENGLISH.email, "subject_educator", ids.b, "ENG");
  // the class teacher's own notes: one waiting (a card under This week), one confirmed now (a card under Done)
  const [{ staff }] = await sql<{ staff: string }[]>`select staff_id as staff from pii.staff where email = ${TEACHER.email}`;
  ids.note = await aK2Note(sql, { klass: ids.a, staff }, "U107 note waiting");
  ids.done = await aK2Note(sql, { klass: ids.a, staff }, "U107 note confirmed", "confirmed");
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
  await timetableSwitch(sql, true);
  const [v] = await sql<{ screens: boolean; recording: boolean }[]>`
    select coalesce((select value = 'true'::jsonb from config where key = 'voice.screens_enabled'), false) as screens,
           coalesce((select value = 'true'::jsonb from config where key = 'voice.recording_enabled'), false) as recording`;
  wasVoice = v;
  await voiceSwitch(sql, true, v.recording);
});
test.afterAll(async () => {
  await sql`delete from pii.educator_note where id in (${ids.note}, ${ids.done})`;
  await timetableSwitch(sql, wasTimetable);
  await voiceSwitch(sql, wasVoice.screens, wasVoice.recording);
  await sql.end();
});

test("1. the menu and the title read My day, and the old address still opens it", { tag: "@core" }, async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto(`/today?day=${MONDAY}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My day");
  expect(param(page, "day"), "the old address keeps the day it was given").toBe(MONDAY);
  const nav = await menu(page);
  await expect(nav.getByRole("link", { name: "My day", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Today", exact: true })).toHaveCount(0);
  const phone = await as(browser, TEACHER.email, 400);
  await phone.goto("/my-day");
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("My day");
});

test("2. the day switcher moves to tomorrow, next week and a picked date; the day is in the address and both parts follow it", async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto(`/my-day?day=${MONDAY}`);
  const switcher = page.locator("[data-day-switch]");
  await switcher.getByRole("tab", { name: "Tomorrow" }).click();
  await expect.poll(() => param(page, "day")).toBe(TUESDAY);
  await expect(lessons(page)).toHaveCount(1);
  await page.goto(`/my-day?day=${MONDAY}`);
  await switcher.getByRole("tab", { name: "Next week" }).click();
  await expect.poll(() => param(page, "day")).toBe(NEXT_MONDAY);
  await switcher.locator("input[type=date]").fill(MONDAY);
  await switcher.locator("input[type=date]").press("Enter");
  await expect.poll(() => param(page, "day")).toBe(MONDAY);
  await expect(lessons(page)).toHaveCount(2);
  // the board keeps the chosen day in every link it draws, and its Done column is counted to that day
  await expect(page.locator("[data-my-tasks]")).toHaveAttribute("data-day", MONDAY);
});

test("3. a day with lessons lists that educator's lessons in period order, each in its subject colour", { tag: "@core" }, async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto(`/my-day?day=${MONDAY}`);
  await expect(lessons(page)).toHaveCount(2);
  expect(await lessons(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-lesson")))).toEqual([ids.maths, ids.englishA]);
  const looks = await lessons(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-subject")));
  expect(looks.every(Boolean), "each lesson names its subject's colour").toBe(true);
  expect(looks[0], "two subjects, two colours").not.toBe(looks[1]);
});

test("4. a lesson opens in place to its objective, steps and materials; a rubric only where there is one; no placeholder", { tag: "@core" }, async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto(`/my-day?day=${MONDAY}`);
  await lessons(page).first().locator("[data-lesson-open]").click();
  await expect.poll(() => param(page, "open")).toBe(`lesson:${ids.maths}`);
  expect(new URL(page.url()).pathname, "it opens on the page, not on the lesson's own").toBe("/my-day");
  const prep = page.locator(`[data-lesson="${ids.maths}"] [data-lesson-prep]`);
  await expect(prep.locator("[data-prep=objective]")).toContainText(FULL.objective);
  await expect(prep.locator("[data-prep=steps]")).toContainText("U107 step two");
  await expect(prep.locator("[data-prep=materials]")).toContainText(FULL.materials);
  await expect(prep.locator("[data-prep=rubric]")).toContainText(FULL.level_1);
  await page.goto(`/my-day?day=${MONDAY}&open=lesson:${ids.englishA}`);
  const bare = page.locator(`[data-lesson="${ids.englishA}"] [data-lesson-prep]`);
  await expect(bare.locator("[data-prep=objective]")).toContainText(BARE.objective);
  for (const part of ["steps", "materials", "rubric"]) await expect(bare.locator(`[data-prep=${part}]`), `no ${part}, so no ${part} heading`).toHaveCount(0);
  await expect(bare).not.toContainText(/not yet|none yet|to be added|coming soon|—|n\/a/i);
});

test("5. a subject educator sees only her subject's lessons, in every class; a coordinator with no class sees the school's", async ({ browser }) => {
  const hers = await as(browser, ENGLISH.email);
  await hers.goto(`/my-day?day=${MONDAY}`);
  expect(await lessons(hers).evaluateAll((els) => els.map((e) => e.getAttribute("data-lesson")))).toEqual([ids.englishA, ids.englishB]);
  const school = await as(browser, COORDINATOR.email);
  await school.goto(`/my-day?day=${MONDAY}`);
  for (const id of [ids.maths, ids.englishA, ids.englishB]) await expect(school.locator(`[data-my-lessons] [data-lesson="${id}"]`)).toHaveCount(1);
});

test("6. one card per kind and class, in the column its urgency gives it; Done shows what was finished in the period", { tag: "@core" }, async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto("/my-day");
  for (const key of ["now", "week", "ready", "done"] as const) await expect(lane(page, key)).toHaveCount(1);
  const waiting = lane(page, "week").locator('[data-kcard][data-card-kind="note"][data-card-class$="U107A"]');
  await expect(waiting, "her waiting notes of one class are one card").toHaveCount(1);
  const seen = await cards(page).evaluateAll((els) => els.map((e) => `${e.getAttribute("data-card-kind")}|${e.getAttribute("data-card-class")}|${e.closest("[data-lane]")?.getAttribute("data-lane")}`));
  expect(new Set(seen).size, "no kind and class twice in a column").toBe(seen.length);
  await expect(lane(page, "done").locator('[data-kcard][data-card-kind="note"][data-card-class$="U107A"]')).toHaveCount(1);
});

test("7. the time filter and the subject, class and kind filters change which cards show, and are in the address", async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto("/my-day?period=month");
  const done = lane(page, "done").locator('[data-card-kind="note"]');
  await expect(done).toHaveCount(1);
  // a note confirmed a week ago is done this month, not today
  await sql`update pii.educator_note set status_at = now() - interval '8 days' where id = ${ids.done}`;
  await page.locator("[data-time-filter]").getByRole("tab", { name: "Today" }).click();
  await expect.poll(() => param(page, "period")).toBe("today");
  await expect(done).toHaveCount(0);
  await expect(lane(page, "week").locator('[data-card-kind="note"]'), "work that waits is never hidden by the time filter").toHaveCount(1);
  await page.goto("/my-day?kind=note");
  expect(await cards(page).evaluateAll((els) => els.every((e) => e.getAttribute("data-card-kind") === "note"))).toBe(true);
  // a class filter is the class as the cards say it ("Grade 9 U107A"); one she has no work in is no filter
  await page.goto("/my-day");
  const said = (await lane(page, "week").locator('[data-card-kind="note"]').first().getAttribute("data-card-class"))!;
  await page.goto(`/my-day?class=${encodeURIComponent(said)}`);
  expect(await cards(page).evaluateAll((els, c) => els.every((e) => [c, ""].includes(e.getAttribute("data-card-class") ?? "")), said)).toBe(true);
  await page.goto("/my-day?class=U107B");
  expect(param(page, "class")).toBe("U107B");
  await expect(lane(page, "week").locator('[data-card-kind="note"]'), "a class she has no work in narrows nothing").toHaveCount(1);
  await sql`update pii.educator_note set status_at = now() where id = ${ids.done}`;
});

test("8. a card's one action opens the screen the old Today row opened", { tag: "@core" }, async ({ browser }) => {
  const page = await as(browser, TEACHER.email);
  await page.goto("/my-day?kind=note");
  const card = lane(page, "week").locator(".b-kitem").filter({ has: page.locator('[data-card-kind="note"]') });
  await expect(card.locator("a.btn"), "one action, no more").toHaveCount(1);
  await expect(card.locator("a.btn")).toHaveAttribute("href", `/notes/${ids.note}`);
});

test("9. at 400 px the page does not scroll sideways, the columns swipe and the lesson strip stacks", async ({ browser }) => {
  const page = await as(browser, TEACHER.email, 400);
  await page.goto(`/my-day?day=${MONDAY}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll of the page").toBe(true);
  const board = page.locator("[data-my-tasks] [data-block=KanbanBoard]");
  expect(await board.evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).scrollSnapType.startsWith("x")), "the board scrolls in its own box, a column at a time").toBe(true);
  const boxes = await lessons(page).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: Math.round(r.left), y: Math.round(r.top) })));
  expect(boxes[1].y, "the second lesson sits under the first").toBeGreaterThan(boxes[0].y);
  expect(boxes[1].x).toBe(boxes[0].x);
});

// 10. u90 (design system): held by tests/u90-design-system.spec.ts, which walks every page; My day joins its list of pages in phase 2.
