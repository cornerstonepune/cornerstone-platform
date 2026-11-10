/**
 * U70 (UI-13), Done when 11 and 12 — the inventory test is proved on tests/fixtures/mini-inventory.json, two pages that exist and
 * are framed by this slice: it passes on them, and a deliberately broken copy (a missing control, a dead link, a name not in the
 * allow-list) fails with the reason named.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { FAKE_FIRST_NAMES, FAKE_NAMES } from "./fake-names";
import { inventoryRows, type Rows } from "./inventory-fixtures";
import { loadInventory, type Inventory } from "./inventory/load";
import { auditScreen } from "./inventory/run";

const mini = () => loadInventory(path.join(__dirname, "fixtures/mini-inventory.json"));
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let rows: Rows;
test.beforeAll(async () => {
  rows = await inventoryRows(sql);
});
test.afterAll(async () => {
  await sql.end();
});
const allow = [...FAKE_NAMES, ...FAKE_FIRST_NAMES];
const audit = (browser: Parameters<typeof auditScreen>[0], inv: Inventory, id: string, role: "educator" | "coordinator" = "coordinator", names: string[] = [], address?: Record<string, string>) =>
  auditScreen(browser, inv.screens.find((s) => s.id === id)!, role, 1440, { inv, rows, allow, names, address });

test("the mini inventory passes on both of its screens, as the educator and as the coordinator, at 1440 and at 400", async ({ browser }) => {
  test.setTimeout(300_000);
  const inv = mini();
  for (const s of inv.screens)
    for (const role of ["educator", "coordinator"] as const)
      for (const width of [1440, 400]) expect(await auditScreen(browser, s, role, width, { inv, rows, allow, names: [] }), `${s.id} ${role} ${width}`).toEqual([]);
});

test("a control the inventory lists and the page lacks fails, naming the control", async ({ browser }) => {
  const inv = mini();
  inv.screens[0].elements.push({ t: "button", label: "Approve everything", href: "/nowhere" });
  const problems = await audit(browser, inv, "across");
  expect(problems.join("\n")).toContain("missing control — “Approve everything”");
});

test("a link that lands on the wrong screen fails as a dead link, naming both headings", async ({ browser }) => {
  const inv = mini();
  inv.screens[0].elements[0] = { t: "link", label: "Check answers", href: "/capture/check", to: "password" };
  const problems = await audit(browser, inv, "across");
  expect(problems.join("\n")).toMatch(/“Check answers” did not land on password: its h1 is “Check answers”, expected “Change password” \(a dead link\)/);
});

test("a child's name that is not in tests/fake-names.ts fails, naming the name", async ({ browser }) => {
  const inv = mini();
  inv.screens.push({ id: "child", route: "/growth/[id]", group: "Children", who: "both", title: "[name]", elements: [] });
  const first = Object.keys(rows.children)[0];
  const shown = first.split(" ")[0];
  // the allow-list without the name the page shows, as it would be if a real child's name had been put in a fixture
  const problems = await auditScreen(browser, inv.screens.at(-1)!, "coordinator", 1440, { inv, rows, allow: allow.filter((n) => n !== shown && n !== first), names: [shown] });
  expect(problems.join("\n")).toContain(`the name “${shown}” is on the page and is not in tests/fake-names.ts`);
});
