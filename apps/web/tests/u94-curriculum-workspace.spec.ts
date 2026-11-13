/**
 * U94 — Curriculum as the page charter's Part C line draws it (docs/frontend/page-charter.md: "Curriculum · Activity (editing) · Objective ·
 * Skill — keep for the coordinator under School; Workspace: list left, detail right"), with the shared frame of Part A (the detail panel
 * opened full page is the thing's own address, A2) and the rule of B4 that a teacher never lands on the curriculum editor from a lesson.
 * One test per part of the line. The rows are the spec's own (tests/u94-rows.ts); the lesson of the B4 test is a class of its own
 * (section U94, grade G9), its educator named from tests/fake-names.ts.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { k2Class } from "./k2-rows";
import { gate } from "./m1-13-rows";
import { litSection, menu } from "./menu";
import { aPerson, personAsStored } from "./rows";
import { LO_MACHINE, MACHINE, NAMES, SHEET, u94Rows } from "./u94-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u94-lesson-educator@cornerstone.test", name: FAKE_STAFF[5], role: "educator", classes: [], subjects: [] };
const LIST = 'table[aria-label="Activities and skills"]';
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");
let skillSet = { code: "", name: "" };
let lesson = "";

test.beforeAll(async () => {
  const { tenant } = await u94Rows(sql);
  [skillSet] = await sql<{ code: string; name: string }[]>`
    select code, name from skill where grade <> (select value #>> '{}' from config where key = 'curriculum.screens_grade') order by code limit 1`;
  // a lesson of a class of the spec's own, holding the sheet's activity, and an educator who covers that class
  const [had] = await sql<{ id: string }[]>`select id from school_class where section = 'U94' and grade_code = 'G9' limit 1`;
  const klass = had?.id ?? (await k2Class(sql, "U94")).klass;
  await sql`update school_class set grade_code = 'G9' where id = ${klass}`;
  const [{ campus, today }] = await sql<{ campus: string; today: string }[]>`select campus_id as campus, (now() at time zone 'Asia/Kolkata')::date::text as today from school_class where id = ${klass}`;
  const [day] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${today}::date, 'teaching')
    on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
  const [p] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${tenant}, 'G9', 9411, '05:59:41', 'U94 lesson', false)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  [{ id: lesson }] = await sql<{ id: string }[]>`
    insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
    values (${tenant}, ${klass}, ${day.id}, ${p.id}, 'math', 'subject', 'planned', true, 'U94 lesson', ${SHEET})
    on conflict (school_class_id, school_day_id, period_id) do update set activity_code = ${SHEET} returning id`;
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 3, 'u94 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass} and g.role_code = 'cover_educator')`;
});
test.beforeEach(async () => {
  await gate(sql, "open");
});
test.afterAll(async () => {
  await gate(sql, "closed");
  await sql.end();
});

const educatorPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test("keep for the coordinator under School: Curriculum is a page of School, and the coordinator's list leads with its filter row", async ({ page }) => {
  await page.goto("/setup/curriculum");
  await expect(litSection(page)).toHaveText("School");
  await expect((await menu(page)).locator("[aria-current=page]")).toHaveText(/^Curriculum/);
  await expect(page.getByTestId("stage")).toHaveText("School");
  // the one primary action is the filter row (charter A3, A4)
  await expect(page.locator("[data-ux=action] [data-block=FilterBar]")).toHaveCount(1);
});

test("Workspace: the list on the left, and the item chosen on the right in tabs, without leaving the page", async ({ page }) => {
  await page.goto("/setup/curriculum?q=U94");
  // nothing chosen: the panel is the page's summary, counted tiles and no list of links
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(panel(page).locator("[data-block=StatTile]").first()).toBeVisible();
  // a row opens its activity on the right: the address carries it, the list stays
  await page.locator(`${LIST} [data-open-key="activity:${MACHINE}"]`).click();
  await expect(page).toHaveURL(/\/setup\/curriculum\?.*open=activity/);
  await expect(page.locator(LIST)).toBeVisible();
  await expect(panel(page)).toHaveAttribute("data-panel", "open");
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(NAMES[MACHINE]);
  await expect(panel(page).getByRole("tab")).toHaveText(["Parts", "Objectives", "Skills", "Taught"]);
  await expect(page.locator(`${LIST} [data-open-key="activity:${MACHINE}"]`)).toHaveAttribute("aria-current", "true");
  // an objective opens in the same panel, and a skill of grades 1 to 4 from its own row
  await panel(page).getByRole("tab", { name: "Objectives" }).click();
  await panel(page).getByRole("link", { name: "U94 counts blocks to ten" }).click();
  await expect(page).toHaveURL(new RegExp(`open=objective(%3A|:)${LO_MACHINE}`));
  await expect(panel(page).getByRole("tab")).toHaveText(["Skills", "Activities"]);
  await page.goto(`/setup/curriculum?q=${encodeURIComponent(skillSet.name)}`);
  await page.locator(`${LIST} [data-open-key="skillset:${skillSet.code}"]`).first().click();
  await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(skillSet.name);
  await expect(panel(page).getByRole("tab")).toHaveText(["Levels"]);
  // closing goes back to the list as it was
  await panel(page).locator("[data-panel-close]").click();
  await expect(page).not.toHaveURL(/open=/);
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
});

test("the detail opened full page is the item's own address, with the same tabs", async ({ page }) => {
  await page.goto(`/setup/curriculum?open=activity:${MACHINE}`);
  await panel(page).getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(new RegExp(`/setup/activities/${MACHINE}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAMES[MACHINE]);
  await expect(page.locator("[data-block=DetailPanel]").getByRole("tab")).toHaveText(["Parts", "Objectives", "Skills", "Taught"]);
  // its next step goes back to Curriculum with it open
  await expect(page.locator("[data-ux=next]")).toHaveAttribute("href", new RegExp(`/setup/curriculum\\?open=activity%3A${MACHINE}`));
  await page.goto(`/setup/curriculum?open=objective:${LO_MACHINE}`);
  await panel(page).getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(new RegExp(`/setup/objectives/${LO_MACHINE}$`));
  await expect(page.locator("[data-block=DetailPanel]").getByRole("tab")).toHaveText(["Skills", "Activities"]);
});

test("B4: a lesson never sends an educator to the curriculum editor; the coordinator keeps the way there", async ({ browser, page }) => {
  const edu = await educatorPage(browser);
  await edu.goto(`/period/${lesson}`);
  await expect(edu.getByRole("heading", { level: 1 })).toHaveText(NAMES[SHEET]);
  await expect(edu.locator("[data-open-activity], main a[href^='/setup/activities/']")).toHaveCount(0);
  await edu.context().close();
  await page.goto(`/period/${lesson}`);
  await expect(page.locator("[data-open-activity]")).toHaveAttribute("href", new RegExp(`^/setup/activities/${SHEET}\\?back=`));
});
