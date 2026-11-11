/**
 * U73 (UI-3c) — a level's sentence on the skill screen: changed by a coordinator through the engine's CP-31 route, with its earlier
 * sentences shown. Specs/UI-3c/spec.md lines 21 to 23. The skill set it changes is this test's own, made once; a second run finds it.
 */
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { sessionFor } from "./inventory-fixtures";
import { gate } from "./m1-13-rows";
import { aPerson, personAsStored } from "./rows";

const SET = "U73.SET";
// a reason of this run alone: the log is append-only, so an earlier run on the same database has left its own rows
const REASON = `u73 wording ${Date.now()}`;
const EDUCATOR = { email: "u73-educator@cornerstone.test", name: "Ivy Iris", role: "educator", classes: [] as string[], subjects: ["NUM"] };
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let url = "";

test.beforeAll(async () => {
  await gate(sql, "reviewer");
  await sql`update config set value = 'true'::jsonb where key = 'educator.timetable_enabled'`;
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [registry] = await sql<{ code: string }[]>`select code from registry_skill where tenant_id = ${tenant} order by code desc limit 1`;
  const mark = { by: "u73", at: "2026-01-01T00:00:00+00" };
  // a skill set (grades 1 to 4) that points at that registry skill, with two levels, both approved
  await sql`insert into skill (tenant_id, code, rung_code, name, learning_objective, difficulty, grade, descriptor, registry_codes, level_approved)
    values (${tenant}, ${SET}, 'U73R', 'A test set', 'a test', ${sql.json({ Easy: { words: "Sorts two things.", check: {} }, Hard: { words: "Sorts ten things.", check: {} } })}, 'G3', 'a test set', ${[registry.code]}, ${sql.json({ Easy: mark, Hard: mark })})
    on conflict (tenant_id, code) do nothing`;
  url = `/setup/skills/${registry.code}`;
});
test.afterAll(async () => {
  await gate(sql, "closed");
  await sql.end();
});

async function asEducator(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
}

test("21 · a coordinator may change a level's sentence and sees each earlier one with who and when; an educator may not", async ({ browser, page }) => {
  const edu = await asEducator(browser);
  const ep = await edu.newPage();
  await ep.goto(url);
  await expect(ep.locator("[data-level-words]")).toHaveCount(2);
  await expect(ep.locator("[data-fold=change-words]")).toHaveCount(0);
  await edu.close();
  await page.goto(url);
  await expect(page.locator("[data-fold=change-words]")).toHaveCount(2);
  await page.locator("[data-fold=levels] > summary").click();
  const level = page.locator("[data-level-words=Easy]");
  await level.locator("[data-fold=change-words] summary").click();
  await level.locator("textarea[name=words]").fill("Sorts three things by size.");
  await level.locator("input[name=reason]").fill(REASON);
  await level.getByRole("button", { name: "Save" }).click();
  // the history lists the sentence the level was made with before anything is changed, so only the new row (with the reason) proves the save
  await page.locator("[data-level-words=Easy] [data-fold=level-history] summary").click();
  const saved = page.locator("[data-level-words=Easy] [data-earlier]", { hasText: REASON });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("Sorts two things.");
  await expect(saved).toContainText("Sorts three things by size.");
  await expect(page.locator("[data-level-words=Hard]")).toContainText("Sorts ten things.");
});

test("22 · a change is logged with the staff id and the reason, and takes only that level out of approved", async () => {
  const [log] = await sql<{ staff_id: string | null; reason: string | null }[]>`
    select staff_id::text, reason from change_log where table_name = 'skill_level' and row_id = ${SET + " Easy"} and reason = ${REASON} and (after ? 'looks_like') limit 1`;
  expect(log.staff_id).not.toBeNull();
  expect(log.reason).toBe(REASON);
  const [now] = await sql<{ hard: string; easy_ok: boolean; hard_ok: boolean }[]>`
    select difficulty -> 'Hard' ->> 'words' as hard, level_approved ? 'Easy' as easy_ok, level_approved ? 'Hard' as hard_ok from skill where code = ${SET}`;
  expect(now.hard).toBe("Sorts ten things.");
  expect(now.easy_ok).toBe(false);
  expect(now.hard_ok).toBe(true);
});

test("23 · an empty sentence is refused and nothing is written", async ({ page }) => {
  const words = () => sql<{ w: string }[]>`select difficulty -> 'Hard' ->> 'words' as w from skill where code = ${SET}`.then((r) => r[0].w);
  const was = await words();
  await page.goto(url);
  await page.locator("[data-fold=levels] > summary").click();
  const level = page.locator("[data-level-words=Hard]");
  await level.locator("[data-fold=change-words] summary").click();
  const field = level.locator("textarea[name=words]");
  await field.fill("   ");
  await field.evaluate((el) => el.removeAttribute("required"));
  await level.getByRole("button", { name: "Save" }).click();
  await page.waitForLoadState("networkidle");
  expect(await words()).toBe(was);
});
