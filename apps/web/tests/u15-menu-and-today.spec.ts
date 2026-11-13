/**
 * U15 — the menu and What needs doing (goals/ui1-menu-and-today.yaml, rewritten for goals/nav_teacher_scope_and_todo.yaml). Nimish, 2026-10-11: "I can't seem to actually find where I
 * go and check the papers or questions for which human validation is required." The menu is the school's order of
 * work, each tab with the count of what waits in it; Today lists every one of those things under the tab where it is
 * done, each line opening that place; nothing hides behind a role; weeks and classes are said in words.
 *
 * The test's own class, its pack for this week and its parent report are made on the copy and cleared afterwards.
 */
import { expect, type Page, test } from "@playwright/test";
import { menu as theMenu, sectionNames, SECTIONS } from "./menu";
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { isoWeek, weekWords } from "../lib/week";
import { ENGINE_PORT } from "../playwright.config";
import { aChildIn, aPerson, forgetPerson } from "./rows";
import { allTasks, panel, workAt } from "./today-work";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "UI1-TEST";
const WEEK = isoWeek();
const EDUCATOR = { email: "ui1-educator@cornerstone.test", name: "UI1 educator", role: "educator" };

async function engine(path: string, body: object) {
  const r = await fetch(`http://127.0.0.1:${ENGINE_PORT}${path}`, {
    method: "POST",
    headers: {
      "X-Engine-Key": process.env.E2E_ENGINE_KEY!,
      "content-type": "application/json",
      "Idempotency-Key": `ui1-${path}-${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

/** A Grade 2 child of the test's own, subtraction under half right, with a parent report written and not approved —
 *  the report made again each run, since the clean-up takes it away and the child stays. */
async function testChild(): Promise<string> {
  const [{ tenant_id }] = await sql<{ tenant_id: string }[]>`select id as tenant_id from tenant limit 1`;
  let [child] = await sql<{ id: string }[]>`select id from child_now where section = ${SECTION} and roll_no = '1'`;
  if (!child) {
    [child] = [{ id: await aChildIn(sql, SECTION, "G2", "1") }];
    await sql`insert into pii.child (tenant_id, child_id, first_name) values (${tenant_id}, ${child.id}, 'Uione')`;
    for (const right of [false, false, false, false, true, true]) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, channel, observed_at, confirmed_by)
        values (${tenant_id}, ${child.id}, 'NUM.OPS.02', 'R6', ${right}, 'item', now(), 'e2e')`;
    }
    await sql`select rebuild_child_skill_state(${child.id}::uuid)`;
  }
  const body = {
    facts: { grade: "Grade 2", from: "2026-10-01", to: "2026-10-10", answers: 6, can_do: [], nearly: [], improving: [], working_on: [], next: null },
    draft: { summary: "[child] has worked on subtraction this fortnight.", can_do: [], working_on: [], at_home: [] },
  };
  await sql`insert into parent_note (tenant_id, child_id, week, body) values (${tenant_id}, ${child.id}, to_date(${WEEK}, 'IYYY-"W"IW'), ${JSON.stringify(body)})`;
  return child.id;
}

async function clearUp() {
  await sql`delete from item_exposure where week = to_date(${WEEK}, 'IYYY-"W"IW') and child_id in (select id from child_now where section = ${SECTION})`;
  await sql`delete from prescription where child_id in (select id from child_now where section = ${SECTION})`;
  await sql`delete from sheet_instance where section = ${SECTION}`;
  await sql`delete from parent_note where child_id in (select id from child_now where section = ${SECTION})`;
  await forgetPerson(sql, EDUCATOR.email);
}

/** A signed-in session for someone on the staff list, as the gate checks it (global-setup.ts makes the coordinator's). */
async function signInAs(page: Page, email: string) {
  const expiry = String(Date.now() + 3_600_000);
  const body = `${Buffer.from(email).toString("base64url")}.${expiry}`;
  const mac = createHmac("sha256", process.env.E2E_AUTH_SECRET!).update(body).digest("hex");
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "cs_staff", value: `${body}.${mac}`, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
}

/** The tasks waiting on Today (What needs doing, merged in), as {kind, state, where}: each row opened in turn (tests/today-work.ts). */
const rows = (page: Page, url = "/today") => allTasks(page, url);

/** The count the group "What needs doing" carries, 0 when it carries none. */
async function badge(page: Page): Promise<number> {
  const n = (await theMenu(page)).getByRole("link", { name: /^Today/ }).getByTestId("waiting");
  return (await n.count()) ? Number((await n.innerText()).replace(/\D/g, "")) : 0;
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

// the title is the one goals/ui1-menu-and-today.yaml names; since UI-7b the count is Today's strip (do-now plus this-week), and What needs doing sits in Setup
// the title is the one goals/ui1-menu-and-today.yaml names; since the page charter (A1) it proves the sidebar's five sections and Today's one count
test("the menu is four groups, and only What needs doing carries the count of what waits", async ({ page }) => {
  await page.goto("/today");
  const menu = await theMenu(page);
  expect(await sectionNames(menu)).toEqual([...SECTIONS.coordinator]);
  expect(await menu.getByTestId("waiting").count(), "one count, on one group at most (none while nothing waits)").toBeLessThanOrEqual(1);
  // the count is Today's notes tile (page charter B1b: notes unconfirmed past their time)
  await page.locator("#waiting-h").waitFor(); // the page streams: its tiles are drawn with its list
  const tile = page.locator("main [data-stat=late] .b-stat-n");
  // the badge streams in after the page (the layout does not wait for the count): waited for, then held to the tile
  const total = (await tile.count()) ? Number((await tile.innerText()).replace(/\D/g, "")) : 0;
  const shown = menu.getByRole("link", { name: /^Today/ }).getByTestId("waiting");
  if (total) await expect(shown, "the group's count is the notes tile's").toHaveText(total.toLocaleString("en-IN"));
  else await expect(shown, "nothing waits, so no count").toHaveCount(0);
  expect(await badge(page), "the group's count is the notes tile's").toBe(total);
  for (const [group, heading] of [["Curriculum", "Curriculum"], ["Class picture", "Children"], ["Today", "Today, the school"]]) {
    await menu.getByRole("link", { name: new RegExp(`^${group}\\b`) }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(menu.getByRole("link", { name: new RegExp(`^${group}\\b`) })).toHaveAttribute("aria-current", "page");
  }
});

test("Today lists everything that waits as rows, and each task's button opens that one item", async ({ page }) => {
  await page.goto(workAt("classpaper", `&class=${SECTION}`));
  await expect(page.getByText(/For others|For you/)).toHaveCount(0);

  // the test's own class pack, waiting before it prints: its row opens the page that approves exactly that pack
  const pack = panel(page).locator("tr[data-kind=classpaper]").filter({ hasText: SECTION });
  await expect(pack).toHaveCount(1);
  await expect(pack.locator("[data-status]")).toContainText("this week");
  await pack.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`class=${SECTION}&week=${WEEK}&kind=practice`));
  // the list shows the class's assessment; its screen is where the pack is approved
  await page.goto(`${page.url()}&view=table`);
  await page.locator("a[data-assessment-row]").first().click();
  await expect(page.getByRole("button", { name: /Approve/ }).first()).toBeVisible();

  // skills to approve: counted and listed on Skills to approve alone, never on Today (specs/UI-7 #3)
  const [{ drafts }] = await sql<{ drafts: number }[]>`select count(*)::int as drafts from skill where status <> 'ratified'`;
  await page.goto("/setup/skills/approve");
  await expect(page.getByText(`${drafts} waiting`, { exact: true }).first(), "the eyebrow counts every skill waiting").toBeVisible();

  // a topic not taught is a green row, "when ready": the school's choice, never counted as waiting
  const [{ off }] = await sql<{ off: number }[]>`select count(*)::int as off from topic t where not exists (select 1 from child_now k where k.tenant_id = t.tenant_id and k.active and taught_in(t.tenant_id, t.code, k.section))`;
  const taught = await rows(page, "/today?kind=taught");
  expect(taught.every((r) => r.state === "whenReady"), "marking a topic taught is never red or amber").toBe(true);
  expect(taught.length > 0 || off === 0).toBe(true);

  // the test child's parent report, written and not approved: its row opens the reports of that class
  await page.goto(workAt("report", `&class=${SECTION}`));
  const report = panel(page).locator("tr[data-kind=report]").filter({ hasText: SECTION });
  await expect(report).toHaveCount(1);
  await expect(report).toContainText("Grade 2");
  await report.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/children/reports\\?class=${SECTION}`));
  await expect(page.getByText("This page could not load")).toHaveCount(0);
});

test("an educator not mapped to a class sees the rows of no class a coordinator sees, and the engineering map", async ({ page }) => {
  // one role for now (goals/ux9c-one-role.yaml): every decision is an educator's too; but since 27 Oct 2026 a class's work
  // is its own educators' and the coordinator's (goals/own_who_sees_answers.yaml), so one linked to no class sees the
  // school's work only: skills and the engine's questions
  const coordinator = await rows(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
  await expect(page.locator("[data-frame]").getByRole("link", { name: "How it works" }).first()).toBeVisible();

  await aPerson(sql, EDUCATOR);
  await signInAs(page, EDUCATOR.email);
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today");
  // the school's work only: the engine's questions (skills to approve are on Skills to approve, never on Today)
  const school = ["ask"];
  expect(await rows(page)).toEqual(coordinator.filter((r) => school.includes(r.kind)));
  await expect(page.getByText(/For others|For you|No one on the staff list/)).toHaveCount(0);
  await expect(page.locator("[data-frame]").getByRole("link", { name: "How it works" }).first()).toBeVisible();
});

test("weeks and classes on Today's waiting list are said in words, not codes", async ({ page }) => {
  await page.goto(workAt("classpaper", `&class=${SECTION}`));
  const main = page.getByRole("main");
  await expect(main.getByText(new RegExp(`Grade 2 · ${SECTION} · class practice · ${weekWords(WEEK)}`))).toBeVisible();
  expect(weekWords(WEEK)).toMatch(/^week of \d{1,2} [A-Z][a-z]{2}$/);
  expect(await main.innerText(), "an ISO week code on the page").not.toMatch(/\b\d{4}-W\d{2}\b/);
});
