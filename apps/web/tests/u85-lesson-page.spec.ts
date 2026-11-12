/**
 * U85 (PR 3 after CP-35, CP-39, CP-40) — the lesson page, /period/<lesson>: the activity in full in the school's own words, "Choose an
 * activity" for the coordinator where a lesson has none, and the lesson's own form that saves marks for the class against this lesson.
 * The class is a K2 class the signed-in coordinator holds (tests/k2-rows.ts); its lessons are made here for school today. Placeholder rows,
 * no real names; local copy only.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { k2Class, voiceSwitch, ROLLS } from "./k2-rows";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
// the class, its periods and its two activities are in a grade of their own (G10, used by no other spec), so no other spec's K2 day has an extra period
const GRADE = "G10";
const ACTIVITY = "U85-ACT-ONE";
const OTHER = "U85-ACT-TWO";
const LEVELS = ["U85 level zero words", "U85 level one words", "U85 level two words", "U85 level three words"];
const EDUCATOR = { email: "u85-educator@cornerstone.test", name: "Lesson Educator Eighty-Five", role: "educator", classes: [], subjects: [] };
let klass = "";
let withActivity = "";
let without = "";
let wasTimetable = false;

const as = async (browser: Browser, email: string): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test.beforeAll(async () => {
  // found once made (a class is never deleted); else a K2-style class (the signed-in person holds it, children enrolled) moved to the spec's own grade
  const [had] = await sql<{ id: string }[]>`select id from school_class where section = 'U85' and grade_code = ${GRADE} limit 1`;
  if (had) klass = had.id;
  else {
    ({ klass } = await k2Class(sql, "U85"));
    await sql`update school_class set grade_code = ${GRADE} where id = ${klass}`;
  }
  const [{ tenant, campus, today }] = await sql<{ tenant: string; campus: string; today: string }[]>`
    select c.tenant_id as tenant, c.campus_id as campus, (now() at time zone 'Asia/Kolkata')::date::text as today from school_class c where c.id = ${klass}`;
  // two activities of the grade, in the group Maths a Maths lesson takes; the first as the school wrote it: what it is for, the steps, what to lay out, four levels
  for (const [code, name] of [[ACTIVITY, "U85 first activity"], [OTHER, "U85 second activity"]]) {
    await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${code}, ${GRADE}, 'Maths', ${name}, ${code.slice(-3)}) on conflict (tenant_id, code) do nothing`;
    await sql`insert into activity_skill (tenant_id, activity_code, skill_code) select ${tenant}, ${code}, code from registry_skill where tenant_id = ${tenant} order by code limit 2 on conflict do nothing`;
  }
  await sql`
    update activity set objective = 'U85 what it is for', steps = 'U85 first step' || chr(10) || 'U85 second step', materials = 'U85 lay out a bundle',
      level_0 = ${LEVELS[0]}, level_1 = ${LEVELS[1]}, level_2 = ${LEVELS[2]}, level_3 = ${LEVELS[3]}
    where tenant_id = ${tenant} and code = ${ACTIVITY}`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord) select ${tenant}, ${ACTIVITY}, code, 1 from learning_objective where tenant_id = ${tenant} order by code limit 1 on conflict do nothing`;
  const [day] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${today}::date, 'teaching')
    on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
  const lesson = async (starts: string, ord: number, text: string, activity: string | null) => {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${`U85 ${text}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
    const [s] = await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${klass}, ${day.id}, ${p.id}, 'math', 'subject', 'planned', true, ${`U85 ${text}`}, ${activity})
      on conflict (school_class_id, school_day_id, period_id) do update set activity_code = ${activity}, text = excluded.text returning id`;
    return s.id;
  };
  withActivity = await lesson("20:11", 8511, "lesson with an activity", ACTIVITY);
  without = await lesson("20:41", 8512, "lesson without one", null);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 3, 'u85 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
  await timetableSwitch(sql, true);
  await voiceSwitch(sql, true);
});
test.afterAll(async () => {
  if (without) await sql`update session set activity_code = null where id = ${without}`;
  await timetableSwitch(sql, wasTimetable);
  await voiceSwitch(sql, false);
  await sql.end();
});

test("a lesson with an activity shows it in full: what it is for, the steps, what to lay out, objectives, skills and the four levels, in the school's words", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("[data-part=outcome]")).toContainText("U85 what it is for");
  await expect(page.getByText("U85 first step")).toBeVisible();
  await expect(page.getByText("U85 second step")).toBeVisible();
  await page.getByText("Lay out", { exact: true }).click();
  await expect(page.getByText("U85 lay out a bundle")).toBeVisible();
  const [{ skills }] = await sql<{ skills: number }[]>`select count(*)::int as skills from activity_skill where activity_code = ${ACTIVITY}`;
  expect(skills).toBeGreaterThan(0);
  await expect(page.locator("[data-part=objectives] h3", { hasText: "Skills" }).locator("xpath=following-sibling::ul[1]/li")).toHaveCount(skills);
  await expect(page.locator("[data-part=objectives] h3", { hasText: "Objectives" }).locator("xpath=following-sibling::ul[1]/li")).toHaveCount(1);
  await page.getByText("The four levels", { exact: true }).click();
  await expect(page.locator("[data-part=levels] li")).toHaveText(LEVELS);
  // and the voice note is on the same page, carrying the lesson
  await expect(page.getByRole("link", { name: "Record a note" })).toHaveAttribute("href", `/record?session=${withActivity}`);
});

test("a lesson with no activity says so, invents nothing, shows no form, and offers the coordinator the activities of its kind", async ({ page }) => {
  await page.goto(`/period/${without}`);
  const none = page.locator("[data-no-activity]");
  await expect(none).toContainText("This lesson has no activity yet.");
  await expect(page.locator("[data-lesson-form]")).toHaveCount(0);
  await expect(page.locator("[data-part=outcome], [data-part=levels]")).toHaveCount(0);
  const choose = none.locator("form[aria-label='Choose an activity']");
  const options = choose.locator("select option");
  expect(await options.count()).toBeGreaterThan(1); // "Choose one…" and the activities the engine offers for a Maths lesson
  await expect(choose.getByRole("button", { name: "Choose an activity" })).toBeDisabled(); // nothing chosen yet
});

test("the coordinator chooses an activity: the lesson then holds it, shows it, and offers the form", async ({ page }) => {
  await page.goto(`/period/${without}`);
  const choose = page.locator("[data-no-activity] form[aria-label='Choose an activity']");
  await choose.locator("select").selectOption(OTHER);
  await choose.getByRole("button", { name: "Choose an activity" }).click();
  await expect(page.locator("[data-no-activity]")).toHaveCount(0);
  await expect(page.locator("[data-lesson-form]")).toBeVisible();
  const [{ code }] = await sql<{ code: string | null }[]>`select activity_code as code from session where id = ${without}`;
  expect(code).toBe(OTHER);
  await sql`update session set activity_code = null where id = ${without}`;
});

test("the lesson's form: tap a child, pick what they showed, choose the level beside its words, Save: the marks are kept against this lesson", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  const form = page.locator("[data-lesson-form]");
  await expect(form).toBeVisible();
  const cells = form.locator("[data-roll]");
  await expect(cells).toHaveCount(ROLLS.length);
  // level words beside the four levels
  await expect(form.locator("[data-levels]")).toContainText(LEVELS[2]);
  // saving without a level asks for one
  await form.getByRole("button", { name: "Save the marks" }).click();
  await expect(form.getByRole("alert")).toContainText("Choose the expected level");
  const count = async () => (await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${klass} and activity_code = ${ACTIVITY}`)[0].n;
  const before = await count();
  await cells.first().click(); // a child
  await form.locator("[data-pick=above]").click();
  await expect(cells.first()).toContainText("Above");
  await form.getByLabel(new RegExp(LEVELS[2])).check();
  await form.getByRole("button", { name: "Save the marks" }).click();
  await expect(form.locator("[data-saved]")).toContainText("Saved: 1 marked, the rest as expected.");
  expect(await count()).toBe(before + ROLLS.length); // the one above and the rest as expected: a row for each child
  const [{ above }] = await sql<{ above: number }[]>`select count(*)::int as above from activity_observation where class_id = ${klass} and activity_code = ${ACTIVITY} and outcome = 'above' and session_id = ${withActivity}`;
  expect(above).toBeGreaterThan(0); // the marks are about this lesson
});

test("an educator who holds the class reads the activity and fills the form but is not offered a choice of activity", async ({ browser }) => {
  const edu = await as(browser, EDUCATOR.email);
  await edu.goto(`/period/${without}`);
  await expect(edu.locator("[data-no-activity]")).toContainText("This lesson has no activity yet.");
  await expect(edu.locator("form[aria-label='Choose an activity']")).toHaveCount(0);
  await expect(edu.locator("[data-no-activity]")).toContainText("The coordinator chooses a lesson's activity.");
  await edu.goto(`/period/${withActivity}`);
  await expect(edu.locator("[data-lesson-form]")).toBeVisible();
  await expect(edu.getByText("Choose another activity")).toHaveCount(0);
  await edu.context().close();
});
