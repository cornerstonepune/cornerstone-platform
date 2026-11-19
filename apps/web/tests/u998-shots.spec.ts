import { test } from "@playwright/test";
import postgres from "postgres";
import { gate } from "./m1-13-rows";
const OUT = "/tmp/claude-0/-home-user-cornerstone-platform/f9ae1f4c-6a2b-5c2b-a1e5-c00cb6629755/scratchpad/ux/after";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { await gate(sql, "open"); });
test.afterAll(async () => { await gate(sql, "closed"); await sql.end(); });
const PAGES: [string, string][] = [
  ["01-activity", "/setup/activities/ACT-K2-0062"],
  ["01b-activity-edit", "/setup/activities/ACT-K2-0062?edit=connects"],
  ["02-skill", "/setup/skills/NUM.MEAS.03"],
  ["03-objective", "/setup/objectives/LO-K2-UX-1"],
  ["09b-skill-group", "/setup/skill-sets/ADD.1D1D"],
  ["10-period-curriculum-panel", "/setup/curriculum?open=activity:ACT-K2-0062"],
];
for (const [w, h] of [[1440, 900], [400, 800]])
  for (const [name, url] of PAGES)
    test(`${name} ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${OUT}/${name}_${w}.png`, fullPage: true });
    });
