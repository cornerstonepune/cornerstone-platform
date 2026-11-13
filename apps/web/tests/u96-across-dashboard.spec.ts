/**
 * U96 — Across every class as the page charter's Part C draws it: "keep its job (Nimish locked it 22 Oct), reshape to Dashboard: stat
 * tiles per class + one table: stage, overdue checks, papers missing > 3 days, children struggling in ≥2 subjects". One test per line of
 * the row, in its order. The class is the spec's own (U96A), its children from tests/fake-names.ts; its one paper, printed five days ago
 * and not back, is made each run with a code of its own. The rows behind each number are s43's (tests/s43-across-classes.spec.ts).
 */
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { aClass } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U96A";
const QR = `CS${randomBytes(3).toString("hex").toUpperCase()}`;
let classId = "";

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G3", FAKE_CHILDREN.slice(0, 2) as string[]);
  [{ id: classId }] = await sql<{ id: string }[]>`select id::text from school_class where label = ${SECTION} order by created_at limit 1`;
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${Object.values(kids)[0]}`;
  const [t] = await sql<{ id: string }[]>`select id from sheet_template where source = 'library' and retired_at is null and band = 'G3' order by code limit 1`;
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION}`;
  await sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at, created_at)
    values (${tenant}, ${QR}, ${t.id}, ${Object.values(kids)[0]}, ${SECTION}, date_trunc('week', now())::date, 'practice', 'printed', 'e2e',
            now() - interval '5 days', now() - interval '5 days', now())`;
});
test.afterAll(async () => {
  await sql.end();
});

test("Across classes keeps its job: the page is still Across every class, opened from the School menu", async ({ page }) => {
  await page.goto("/across");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Across every class");
  await expect(page.locator("[data-sidebar] a[href='/across']").first()).toHaveAttribute("aria-current", "page");
});

test("Dashboard: a stat tile per class, counting what waits on it", async ({ page }) => {
  await page.goto("/across");
  const tiles = page.locator("main [data-part=class-tiles] [data-block=StatTile]");
  const rows = page.getByRole("table", { name: "Each class" }).locator("tbody tr");
  // a tile for every class in the table, and no other
  await expect(tiles).toHaveCount(await rows.count());
  const ours = page.locator(`main [data-stat="class-${SECTION}"]`);
  await expect(ours).toContainText(`${SECTION}: to follow up`);
  // its one paper not back, nothing else: amber, and it opens the class on the right
  await expect(ours.locator(".b-stat-n")).toHaveText("1");
  await expect(ours).toHaveAttribute("data-state", "wait");
  await ours.click();
  await expect(page).toHaveURL(new RegExp(`open=class:${classId}`));
  await expect(page.locator("[data-block=DetailPanel] [data-panel-title]")).toContainText(SECTION);
});

test("one table: a class to a row, with stage, overdue checks, papers missing over 3 days, and children struggling in two or more subjects", async ({ page }) => {
  await page.goto("/across");
  const table = page.getByRole("table", { name: "Each class" });
  await expect(page.getByRole("table")).toHaveCount(1);
  const heads = (await table.locator("thead th").allTextContents()).map((h) => h.trim());
  expect(heads).toEqual(["Class", "Stage", "Overdue checks", "Papers not back > 3 days", "Needing help in ≥ 2 subjects"]);
  const row = table.locator(`tr[data-class="${SECTION}"]`);
  await expect(row).toHaveCount(1);
  await expect(row.locator("[data-cell=missing]")).toHaveText("1");
  await expect(row.locator("[data-cell=overdue]")).toHaveText("0");
  await expect(row.locator("[data-cell=help]")).toHaveText("0");
  // a number opens the class on the tab of the rows it counts
  await row.locator("[data-cell=missing]").click();
  await expect(page).toHaveURL(new RegExp(`open=class:${classId}&tab=missing`));
  await expect(page.getByRole("table", { name: "Papers not back" }).getByRole("row").filter({ hasText: QR }).locator("td.num")).toHaveText("5");
});

test("the right side: the school's totals with nothing chosen; a class's tabs and its picture full page when one is", async ({ page }) => {
  await page.goto("/across");
  const panel = page.locator("[data-block=DetailPanel]");
  await expect(panel).toHaveAttribute("data-panel", "summary");
  await expect(panel.locator("[data-stat]")).toHaveCount(3);
  await expect(panel.locator("[data-stat=missing] .b-stat-n")).not.toHaveText("0");
  await page.locator(`tr[data-class="${SECTION}"] [data-class-open]`).click();
  await expect(page.getByRole("tab")).toHaveText(["Stage", "Overdue", "Not back", "Needing help"]);
  await expect(page.locator("[data-panel-full]")).toHaveAttribute("href", `/children/${classId}`);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/across$/);
});
