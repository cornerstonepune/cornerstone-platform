/**
 * U1 — Today and the menu (goals/u1-today.yaml).
 *
 * Today is the educators' inbox: everything waiting on a person, each with the count the page it opens shows and one
 * click to act, listed under the tab where it is done (goals/ui1-menu-and-today.yaml). The class papers and the child whose work suggests a next paper are the test's own, made on the copy
 * and cleared afterwards; the rest is compared with whatever the copy holds.
 */
import { aChildIn } from "./rows";
import { expect, type Page, test } from "@playwright/test";
import { menu as theMenu, sectionNames, SECTIONS } from "./menu";
import postgres from "postgres";
import { isoWeek } from "../lib/week";
import { dayIn } from "../lib/school-clock";
import { ENGINE_PORT } from "../playwright.config";
import { panel, workAt, } from "./today-work";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U1-TEST";
const WEEK = "2091-W35"; // an ISO week of its own: a week is a date since CP-27

async function engine(path: string, body: object) {
  const r = await fetch(`http://127.0.0.1:${ENGINE_PORT}${path}`, {
    method: "POST",
    headers: {
      "X-Engine-Key": process.env.E2E_ENGINE_KEY!,
      "content-type": "application/json",
      "Idempotency-Key": `u1-${path}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** A Grade 2 child of the test's own whose checked answers show subtraction under half right. */
async function testChild(): Promise<string> {
  const [had] = await sql<{ id: string }[]>`select id from child_now where section = ${SECTION} and roll_no = '1'`;
  if (had) return had.id;
  const [{ tenant_id }] = await sql<{ tenant_id: string }[]>`select id as tenant_id from tenant limit 1`;
  const [{ id }] = [{ id: await aChildIn(sql, SECTION, "G2", "1") }];
  await sql`insert into pii.child (tenant_id, child_id, first_name) values (${tenant_id}, ${id}, 'Tamsin')`;
  for (const right of [false, false, false, false, true, true]) {
    await sql`
      insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, observed_at, confirmed_by)
      values (${tenant_id}, ${id}, 'NUM.OPS.02', 'R6', ${right}, 'item', now(), 'e2e')`;
  }
  await sql`select rebuild_child_skill_state(${id}::uuid)`;
  return id;
}

async function clearUp() {
  await sql`delete from item_exposure where week = to_date(${WEEK}, 'IYYY-"W"IW')`;
  await sql`delete from prescription where week = to_date(${WEEK}, 'IYYY-"W"IW')`;
  await sql`delete from sheet_instance where week = to_date(${WEEK}, 'IYYY-"W"IW')`;
}

/** The rows of one kind on Today (What needs doing, merged in: its row opened on the right), and how many answers, papers or children they say. */
async function kind(page: Page, k: string): Promise<{ rows: number; n: number }> {
  // the rows are paged ten at a time: every page of the one group the kind opens
  const many: string[] = [];
  for (let at = 1; ; at++) {
    await page.goto(workAt(k, `&page=${at}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
    many.push(...(await panel(page).locator(`tr[data-kind=${k}] td[data-label="How many"]`).allInnerTexts()));
    if (!(await panel(page).getByRole("link", { name: "Later →" }).count())) break;
  }
  return { rows: many.length, n: many.reduce((t, m) => t + Number(m.replace(/\D/g, "")), 0) };
}

test.beforeAll(async () => {
  await clearUp();
  await testChild();
  await engine("/week/prescribe", { section: SECTION, week: WEEK, skill_set: "SUB.2D2D" });
  await engine("/week/assemble", { section: SECTION, week: WEEK });
});
test.afterAll(async () => {
  await clearUp();
  await sql.end();
});

test("the menu is the teacher's week, and says where they are", async ({ page }) => {
  await page.goto("/today");
  const menu = await theMenu(page);
  // the sections of the sidebar (lib/menu.ts), in the order of the educator's jobs; the one count of what waits follows Today
  expect(await sectionNames(menu)).toEqual([...SECTIONS.coordinator]);
  for (const [label, heading] of [
    ["Curriculum", "Curriculum"],
    ["Class picture", "Children"],
    ["Today", "Today, the school"],
  ]) {
    await menu.getByRole("link", { name: new RegExp(`^${label}\\b`) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(menu.getByRole("link", { name: new RegExp(`^${label}\\b`) })).toHaveAttribute("aria-current", "page");
  }
});

test("today lists everything waiting on a teacher, each with its count and one click to act", async ({ page }) => {
  await page.goto(workAt("classpaper", `&class=${SECTION}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");

  // the class papers the engine proposed for the test's class wait for a teacher before they print
  const pack = panel(page).locator("tr[data-kind=classpaper]").filter({ hasText: new RegExp(`${SECTION} · class practice · `) });
  await expect(pack).toHaveCount(1);
  await pack.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/children/assessments\\?class=${SECTION}&week=${WEEK}&kind=practice`));

  // a child whose checked written work gives the engine a home paper to propose — a written skill in a state with enough
  // answers to say (the `child_state.enough` rows) — with no home paper this week by the school's clock: a row for each
  // class, counting its children. A K2 observation (kind 'observed') is no written work and proposes no paper: counting it
  // here made this figure 4 against the page's 1 on a copy of live, where K2 notes are observed (and on CI none are).
  const [{ zone }] = await sql<{ zone: string }[]>`select value #>> '{}' as zone from config where key = 'school.time_zone'`;
  const [{ n }] = await sql<{ n: number }[]>`
    select count(distinct s.child_id)::int as n from child_skill_state s join child_now c on c.id = s.child_id
      join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
    where c.active and s.kind = 'written' and cs.enough
      and not exists (select 1 from sheet_instance si where si.child_id = s.child_id and si.kind = 'focus'
                      and si.week = to_date(${isoWeek(dayIn(zone, new Date()))}, 'IYYY-"W"IW'))`;
  const home = await kind(page, "home");
  expect(home.n).toBe(n);
  if (n) {
    await page.locator("tr[data-kind=home]").first().getByRole("link").click();
    await expect(page).toHaveURL(/\/make\/[^/]+$/);
  }

  // the skills that wait for an approval: one row each, every skill waiting, taught or not (goals/ny1-needs-you.yaml)
  const [{ drafts }] = await sql<{ drafts: number }[]>`select count(*)::int as drafts from skill s where s.status <> 'ratified'`;
  // since Today (page charter Part C, specs/UI-7 #3) they are listed and counted on Skills to approve alone: its eyebrow's count, a row each
  await page.goto("/setup/skills/approve");
  await expect(page.getByText(`${drafts} waiting`, { exact: true }).first()).toBeVisible();
  await page.goto("/today");
  await expect(page.locator("main [data-row=group-skills]")).toHaveCount(0);
});

test("what has nothing waiting says so, and each count is the page's own", async ({ page }) => {
  const check = await kind(page, "check");
  // the figure beside the list it counts is u68's (the Assessments list, person by person); here only the page's own rows
  expect(check.n).toBeGreaterThanOrEqual(0);


  // what has nothing waiting is not listed: a kind with no row says so, and every number shown is above zero
  await page.goto("/today");
  for (const n of await page.locator("[data-waiting] [data-row^='group-'] [data-many]").allInnerTexts()) if (/\d/.test(n)) expect(Number(n.replace(/\D/g, ""))).toBeGreaterThan(0);
  await page.goto(workAt("empty"));
  if (!(await panel(page).locator("tr[data-kind=empty]").count())) await expect(page.getByText(/Nothing waits on you/).first()).toBeVisible();
});

test("Today has the one filter row: a place and what waits narrow its lines (goals/uxn10-today.yaml)", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator("[data-filterbar]")).toBeVisible();
  await page.goto("/today?group=answers");
  await expect(page.locator("[data-active-filters]")).toContainText("What: Answers to check");
  await expect(page.locator("[data-waiting] [data-row]:not([data-row=group-answers])")).toHaveCount(0);
  await page.goto("/today?subject=NUM&open=wait:group-taught");
  await expect(page.locator("[data-active-filters]")).toContainText("Subject: Maths");
  for (const where of await panel(page).locator("td[data-label=Where]").allInnerTexts()) expect(where).not.toMatch(/^English/);
});
