/**
 * U77 (UI-3h) — the class picture and the child's page as their wireframes have them (docs/frontend/wireframes/picture.html and child.html).
 * Whole counts only: nothing scores or ranks a child. The world is tests/children-world.ts.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { NAMES_A, childrenWorld } from "./children-world";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let classA = "";
let kids: Record<string, string> = {};
let tenant = "";

test.beforeAll(async () => {
  ({ classA, kids, tenant } = await childrenWorld(sql));
});
test.afterAll(async () => {
  await sql.end();
});
test.use({ viewport: { width: 1440, height: 900 } });

test("picture · the rail names each skill with how many children were seen on it, and says which one is shown", async ({ page }) => {
  await page.goto(`/children/${classA}`);
  const rail = page.locator("[data-rail]");
  await expect(rail.locator("[data-show]").first()).toContainText("the skill shown");
  const rows = await rail.locator("[data-show]").allInnerTexts();
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows.slice(1)) expect(r).toMatch(/\d+ (child|children) seen/);
});

test("picture · the clusters are the wireframe's, each count equals its chips, a child may be in several", async ({ page }) => {
  await page.goto(`/children/${classA}`);
  const keys = await page.locator("[data-cluster]").evaluateAll((els) => els.map((e) => e.getAttribute("data-cluster")));
  // "close to secure" needs the school's number (a setting), so without it that cluster is not drawn
  expect(keys).toEqual(["ready", "once", "related"]);
  for (const c of await page.locator("[data-cluster]").all()) {
    const n = Number(await c.locator(".b-count").innerText());
    await expect(c.locator(".b-nchip")).toHaveCount(n);
  }
});

test("picture · 'practising, close to secure' appears when the school has set how many times seen makes it", async ({ page }) => {
  await sql`delete from config where key = 'children.close_to_secure_seen'`;
  await sql`insert into config (tenant_id, key, value, description) values (${tenant}, 'children.close_to_secure_seen', '2'::jsonb, 'u77 test')`;
  try {
    await page.goto(`/children/${classA}`);
    await expect(page.locator("[data-cluster=close]")).toBeVisible();
    const n = Number(await page.locator("[data-cluster=close] .b-count").innerText());
    await expect(page.locator("[data-cluster=close] .b-nchip")).toHaveCount(n);
  } finally {
    await sql`delete from config where key = 'children.close_to_secure_seen'`;
  }
});

test("child · three cards in whole counts, the skills by state, and 'Skill by skill' with named days and what is next", async ({ page }) => {
  const child = kids[NAMES_A[0]];
  const [c] = await sql<{ roll_no: string }[]>`select roll_no from child_now where id = ${child}`;
  await page.goto(`/children/${classA}/${c.roll_no}`);
  await expect(page.getByText("Counts by state")).toBeVisible();
  await expect(page.getByText(/skills? seen in all · Sr\. No\. \d+ of \d+ in U72A/)).toBeVisible();
  await expect(page.locator("[data-last-seen] li").first()).toBeVisible();
  const np = page.locator("[data-notes-papers]");
  await expect(np).toContainText("Notes confirmed");
  await expect(np).toContainText("Papers read");
  await expect(np).toContainText("Corrections");
  await expect(np).toContainText("Newest entry");
  // no score, no rank anywhere on the cards
  await expect(page.locator("[data-block=Cards]").first()).not.toContainText(/%|rank|score/i);
  const bySkill = page.getByRole("table", { name: "Skill by skill" });
  await expect(bySkill.getByRole("columnheader")).toHaveText(["Skill", "Named days", "Last seen", "Ready next"]);
  // the same skills in both tables
  const top = await page.getByRole("table", { name: "Where this child is on each skill" }).locator("tbody tr").count();
  await expect(bySkill.locator("tbody tr")).toHaveCount(top);
});
