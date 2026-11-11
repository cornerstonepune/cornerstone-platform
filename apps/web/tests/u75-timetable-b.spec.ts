/**
 * U75 (UI-6b) — what UI-6 left for the second part, one test per Done-when line of specs/UI-6b/spec.md that a browser can check
 * without the engine's Go live route (that part follows when the route is on main). The class "U74" is UI-6's own
 * (tests/timetable-rows.ts).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { HERE, timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
let wasOn = false;

test.beforeAll(async () => {
  f = await timetableRows(sql);
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const TT = () => `/timetable?fn=${HERE}&class=${f.klass}`;

test("Timetable: at 400 px the Day view is the default, and a chosen view is kept", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(TT());
  await expect(page).toHaveURL(/view=day/);
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(1);
  await page.goto(`${TT()}&view=fortnight`);
  await expect(page).toHaveURL(/view=fortnight/);
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(10);
});

test("Timetable: at desktop width the Fortnight view is still the default", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TT());
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(10);
  expect(page.url()).not.toMatch(/view=day/);
});
