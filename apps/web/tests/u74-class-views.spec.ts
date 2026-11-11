/**
 * U74 (UI-3e) — the class picture's "By topic" and "Matrix" views, which carry what /growth (Class results) and
 * /growth/class/[section] showed: topics as rows (a topic opens its skills), and each child against each topic (a topic opens its
 * skills). The address carries the view and what is open; a name leads to the child's page. Fake names only.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aClass } from "./rows";
import { voiceSwitch } from "./k2-rows";

const SECTION = "U74A";
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let classId = "";
let kids: Record<string, string> = {};

test.beforeAll(async () => {
  await voiceSwitch(sql, true);
  kids = await aClass(sql, SECTION, "G2", ["Ishaan", "Meera"]);
  [{ id: classId }] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from evidence_event where child_id = ${kids.Ishaan}`;
  if (!n) {
    for (const right of [false, false, false, false, true, true]) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel, observed_at, confirmed_by)
        values (${tenant}, ${kids.Ishaan}, 'NUM.OPS.02', 'R24', ${right}, ${right ? [] : ["M_SMALL_FROM_LARGE"]}, 'item', now(), 'u74')`;
    }
    await sql`select rebuild_child_skill_state(${kids.Ishaan}::uuid)`;
  }
});
test.afterAll(async () => sql.end());

test.use({ viewport: { width: 1440, height: 900 } });

test("the picture, By topic and Matrix are three tabs of one screen, and the address carries the tab", async ({ page }) => {
  await page.goto(`/children/${classId}`);
  const tabs = page.getByRole("tablist", { name: "View" });
  await expect(tabs.getByRole("tab")).toHaveText(["Picture", "By topic", "Matrix"]);
  await expect(tabs.getByRole("tab", { name: "Picture" })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "By topic" }).click();
  await expect(page).toHaveURL(new RegExp(`/children/${classId}\\?view=topic$`));
  await expect(tabs.getByRole("tab", { name: "By topic" })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "Matrix" }).click();
  await expect(page).toHaveURL(new RegExp(`/children/${classId}\\?view=matrix$`));
});

test("By topic: topics are rows, a topic opens in place and the address keeps the view", async ({ page }) => {
  await page.goto(`/children/${classId}?view=topic`);
  await expect(page.getByRole("region", { name: `Topics of ${SECTION}` })).toBeVisible();
  const first = page.getByRole("region", { name: `Topics of ${SECTION}` }).getByRole("link", { expanded: false }).first();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`/children/${classId}\\?view=topic&topic=`));
  await expect(page.getByRole("region", { name: `Topics of ${SECTION}` }).getByRole("link", { expanded: true }).first()).toBeVisible();
});

test("Matrix: each child against each topic, a topic opens its skills, a name leads to the child's page", async ({ page }) => {
  await page.goto(`/children/${classId}?view=matrix`);
  const grid = page.getByRole("table", { name: `${SECTION}: each child on each topic` });
  await expect(grid.locator("tbody tr")).toHaveCount(2);
  await expect(grid.locator(`tbody tr[data-child="${kids.Ishaan}"]`).getByRole("link", { name: "Ishaan" })).toHaveAttribute("href", new RegExp(`^/children/${classId}/\\d+$`));
  await grid.locator("thead th[data-topic] a").first().click();
  await expect(page).toHaveURL(new RegExp(`/children/${classId}\\?view=matrix&topic=`));
  await expect(page.getByRole("table", { name: `${SECTION}: each child on each step` })).toBeVisible();
  await page.getByRole("table", { name: `${SECTION}: each child on each step` }).getByRole("link", { name: "Ishaan" }).click();
  await expect(page).toHaveURL(new RegExp(`/children/${classId}/\\d+$`));
});
