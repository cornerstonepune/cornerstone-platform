/**
 * U126 — Record what arrived, from the claim that bought it (specs/CP-86/spec.md, Done when 1 to 4 for the screens).
 *
 *  1. A keeper of a campus sees "Record what arrived" on an approved or a paid claim of that campus (My claims), not on a submitted one; a person who keeps
 *     no store never sees it, nor the Arrived tab.
 *  2. The form takes any number of items, each picked with the item picker, with a quantity each; a wrong line refuses the whole save in the engine's words
 *     beside that line and saves nothing; saving records one stock in per item, and the claim then reads what arrived item by item with the day.
 *     "Record more" adds to it.
 *  3. A founder records it from To pay, on an approved claim of a campus.
 *  4. A keeper of another campus is told, in the engine's words, that the claim is not theirs, and has no button.
 *  5. At 1440 px and 400 px the claim's panel with the form open does not scroll sideways and its controls are 44 px tall.
 *
 * Its own campuses, people, claims and items, new for each run (a stock move is never edited or deleted): fake names, placeholder emails. Claims are put in as the
 * rows the engine keeps (an `expense` under the rules in force, an `approval` row for its approval). `SHOTS=<folder>` also saves a screenshot of each look, for looking at.
 */
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const RUN = Date.now().toString(36);
const CAMPUS = `U126 Annexe ${RUN}`;
const OTHER = `U126 Annexe Two ${RUN}`;
const KEEPER = { email: `u126-keeper-${RUN}@cornerstone.test`, name: FAKE_STAFF[1], role: "ops", classes: [], subjects: [] };
const KEEPER_TWO = { email: `u126-keeper-two-${RUN}@cornerstone.test`, name: FAKE_STAFF[4], role: "ops", classes: [], subjects: [] };
const EDUCATOR = { email: `u126-educator-${RUN}@cornerstone.test`, name: FAKE_STAFF[2], role: "educator", classes: [], subjects: [] };
const FOUNDER = { email: `u126-founder-${RUN}@cornerstone.test`, name: FAKE_STAFF[3], role: "founder", classes: [], subjects: [] };
const ITEMS = {
  paper: { code: `MAT-U126-${RUN}-1`, name: `U126 Chart paper ${RUN}`, unit: "sheet" },
  pens: { code: `MAT-U126-${RUN}-2`, name: `U126 Marker pens ${RUN}`, unit: "box" },
  glue: { code: `MAT-U126-${RUN}-3`, name: `U126 Glue sticks ${RUN}`, unit: "piece" },
};
type Item = (typeof ITEMS)[keyof typeof ITEMS];
let tenant = "";
const staff = { keeper: "", keeperTwo: "", educator: "", founder: "" };
const claim: Record<string, string> = {};
const made: string[] = [];
const TODAY = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: width < 700 ? 800 : 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) {
    await page.waitForTimeout(500); // a panel fades in
    await page.screenshot({ path: path.join(process.env.SHOTS, `${name}-${page.viewportSize()?.width}.png`), fullPage: true });
  }
};
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** A claim as the engine keeps one, filed by `by` for `campus`; `state` takes it as far as approved by the founder (and paid on the day, for paid). */
async function file(vendor: string, by: string, campus: string, state: "submitted" | "approved" | "paid"): Promise<string> {
  const [{ v }] = await sql<{ v: number }[]>`select count(*)::int + 1 as v from change_log where table_name = 'config' and row_id = 'money.rules' and op = 'set'`;
  const paid = state === "paid";
  const [row] = await sql<{ id: string }[]>`
    insert into expense (tenant_id, campus_id, claimant_id, spent_on, amount, vendor, category, rule_version, receipt_key, paid_on, payment_mode, payment_ref, paid_by)
    values (${tenant}, ${campus}, ${by}, '2026-11-10', '640.00', ${vendor}, 'Materials', ${v}, 'receipts/2026/u126.png',
            ${paid ? "2026-11-12" : null}, ${paid ? "UPI" : null}, ${paid ? "U126-UTR" : null}, ${paid ? staff.founder : null})
    returning id::text`;
  if (state !== "submitted") await sql`insert into approval (tenant_id, kind, target, decision, by) values (${tenant}, 'expense', ${row.id}, 'approved', ${staff.founder})`;
  made.push(row.id);
  return row.id;
}
const recorded = async (id: string) => (await sql<{ n: number }[]>`select count(*)::int as n from stock_move where expense_id = ${id} and kind = 'in'`)[0].n;
const panelOf = (page: Page) => page.locator("#detail-panel");
const rowOf = (page: Page, i: number) => panelOf(page).locator("[data-arrived-row]").nth(i);
const claimAt = async (page: Page, path: string, id: string) => {
  await page.goto(`${path}?open=claim:${id}`);
  await expect(panelOf(page).locator("[data-panel-title]")).toBeVisible();
};
const choose = async (row: Locator, item: Item) => {
  await row.locator('input[type="search"]').fill(item.name);
  await row.locator(`[data-pick="${item.code}"]`).click();
  await expect(row.locator(`[data-picked="${item.code}"]`)).toContainText(item.name);
};
const quantity = (row: Locator, n: string) => row.locator("[data-field=quantity] input").fill(n);
const moveOf = (page: Page, item: Item) => panelOf(page).locator(`[data-arrived] [data-arrived-move="${item.code}"]`);

test.beforeAll(async () => {
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  for (const name of [CAMPUS, OTHER]) await sql`insert into campus (tenant_id, name) values (${tenant}, ${name}) on conflict (tenant_id, name) do nothing`;
  const [{ id: main }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} and name = ${CAMPUS}`;
  const [{ id: other }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} and name = ${OTHER}`;
  staff.keeper = (await aPerson(sql, KEEPER)).id;
  staff.keeperTwo = (await aPerson(sql, KEEPER_TWO)).id;
  staff.educator = (await aPerson(sql, EDUCATOR)).id;
  staff.founder = (await aPerson(sql, FOUNDER)).id;
  await sql`update staff set campus_id = ${main} where id in (${staff.keeper}, ${staff.educator})`;
  await sql`update staff set campus_id = ${other} where id = ${staff.keeperTwo}`;
  for (const i of Object.values(ITEMS)) await sql`insert into material_item (tenant_id, code, name, unit) values (${tenant}, ${i.code}, ${i.name}, ${i.unit}) on conflict do nothing`;
  claim.approved = await file(`U126 Sai Stores ${RUN}`, staff.keeper, main, "approved");
  claim.paid = await file(`U126 Paid Stores ${RUN}`, staff.keeper, main, "paid");
  claim.submitted = await file(`U126 Waiting Stores ${RUN}`, staff.keeper, main, "submitted");
  claim.theirs = await file(`U126 Educator Stores ${RUN}`, staff.educator, main, "approved"); // an educator's, for the educator and the founder
  claim.strangers = await file(`U126 Strangers ${RUN}`, staff.keeperTwo, main, "approved"); // filed by a keeper of the other campus, for this campus
  for (const w of [1440, 400]) claim[`look${w}`] = await file(`U126 Look ${w} ${RUN}`, staff.keeper, main, "approved");
});
test.afterAll(async () => {
  // the claims are taken back, so no other run's queue (To pay) holds them
  await sql`update expense set status = 'withdrawn' where id = any(${made}::uuid[])`;
  await sql.end();
});

test("1. a keeper sees Record what arrived on an approved or a paid claim of the campus, not on a submitted one; no one who keeps no store sees it", async ({ browser }) => {
  const page = await as(browser, KEEPER.email);
  for (const id of [claim.approved, claim.paid]) {
    await claimAt(page, "/money", id);
    await expect(panelOf(page).locator("[data-arrived-form] summary")).toHaveText("Record what arrived");
    await expect(panelOf(page).locator('[data-tab="arrived"]')).toHaveText("Arrived");
  }
  await shot(page, "button");
  await claimAt(page, "/money", claim.submitted);
  await expect(panelOf(page).locator("[data-arrived-form]")).toHaveCount(0);
  await expect(panelOf(page).locator('[data-tab="arrived"]')).toHaveCount(0);

  const educator = await as(browser, EDUCATOR.email);
  await claimAt(educator, "/money", claim.theirs); // approved, and of the campus, but the educator keeps no store
  await expect(panelOf(educator).locator("[data-claim-standing]")).toContainText("Approved");
  await expect(panelOf(educator).locator("[data-arrived-form]")).toHaveCount(0);
  await expect(panelOf(educator).locator('[data-tab="arrived"]')).toHaveCount(0);
  expect(await educator.content()).not.toContain("Record what arrived");
});

test("2. the form takes several items; a wrong line refuses the whole save in words beside it; saving reads what arrived with the day; Record more adds to it", async ({ browser }) => {
  const page = await as(browser, KEEPER.email);
  await claimAt(page, "/money", claim.approved);
  const panel = panelOf(page);
  await panel.locator("[data-arrived-form] summary").click();
  await expect(panel.locator("[data-arrived-row]")).toHaveCount(1);
  await choose(rowOf(page, 0), ITEMS.paper);
  await quantity(rowOf(page, 0), "24");
  await panel.getByRole("button", { name: "Add another item" }).click();
  await expect(panel.locator("[data-arrived-row]")).toHaveCount(2);
  await choose(rowOf(page, 1), ITEMS.pens);
  await quantity(rowOf(page, 1), "0");
  await panel.getByRole("button", { name: "Save", exact: true }).click();

  // the second line is wrong: the engine's words stand beside it, the first line keeps what was typed, and nothing was saved
  await expect(rowOf(page, 1).locator("[data-field=quantity] [data-error]")).toContainText(`How many ${ITEMS.pens.name} came in must be a number above zero`);
  await expect(rowOf(page, 0).locator("[data-error]")).toHaveCount(0);
  await expect(rowOf(page, 0).locator("[data-field=quantity] input")).toHaveValue("24");
  await shot(page, "refused");
  expect(await recorded(claim.approved)).toBe(0);

  await quantity(rowOf(page, 1), "6");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator("[data-said=arrived]")).toHaveText("Recorded: 2 items.");
  expect(await recorded(claim.approved)).toBe(2);
  // the claim reads what arrived, item by item, with the day, on its own tab; the button now says Record more
  await expect(panel.locator('[data-tab="arrived"]')).toHaveAttribute("aria-selected", "true");
  await expect(moveOf(page, ITEMS.paper)).toContainText(`${ITEMS.paper.name}`);
  await expect(moveOf(page, ITEMS.paper)).toContainText("24 sheet");
  await expect(moveOf(page, ITEMS.pens)).toContainText("6 box");
  await expect(panel.locator("[data-arrived-move]").first()).toContainText(TODAY);
  await expect(panel.locator("[data-arrived-form] summary")).toHaveText("Record more");
  await shot(page, "arrived");

  // more, later: it is added, and the newest comes first
  await panel.locator("[data-arrived-form] summary").click();
  await choose(rowOf(page, 0), ITEMS.paper);
  await quantity(rowOf(page, 0), "6");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator("[data-said=arrived]")).toHaveText("Recorded: 1 item.");
  await expect(panel.locator("[data-arrived-move]")).toHaveCount(3);
  await expect(panel.locator("[data-arrived-move]").first()).toContainText("6 sheet");
  expect(await recorded(claim.approved)).toBe(3);
});

test("3. a founder records what arrived from To pay, on an approved claim of a campus", async ({ browser }) => {
  const page = await as(browser, FOUNDER.email);
  await claimAt(page, "/money/pay", claim.theirs);
  const panel = panelOf(page);
  await expect(panel.locator("[data-mark-paid]")).toBeVisible();
  await panel.locator("[data-arrived-form] summary").click();
  await choose(rowOf(page, 0), ITEMS.glue);
  await quantity(rowOf(page, 0), "10");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.locator("[data-said=arrived]")).toHaveText("Recorded: 1 item.");
  await expect(moveOf(page, ITEMS.glue)).toContainText("10 piece");
  expect(await recorded(claim.theirs)).toBe(1);
  await shot(page, "to-pay");
});

test("4. a keeper of another campus is told in words that the claim is not theirs, and has no button", async ({ browser }) => {
  const page = await as(browser, KEEPER_TWO.email);
  await claimAt(page, "/money", claim.strangers);
  const panel = panelOf(page);
  await expect(panel.locator("[data-arrived-form]")).toHaveCount(0);
  await panel.locator('[data-tab="arrived"]').click();
  await expect(panel.locator("[data-arrived-said]")).toHaveText(`That claim was made for ${CAMPUS}; you keep the store of ${OTHER}.`);
  expect(await recorded(claim.strangers)).toBe(0);
});

for (const width of [1440, 400]) {
  test(`5. at ${width} px the claim's panel with the form open does not scroll sideways and its controls are 44 px tall`, async ({ browser }) => {
    const page = await as(browser, KEEPER.email, width);
    await claimAt(page, "/money", claim[`look${width}`]);
    const panel = panelOf(page);
    expect(await sideways(page), "the panel").toBeLessThanOrEqual(0);
    await panel.locator("[data-arrived-form] summary").click();
    await choose(rowOf(page, 0), ITEMS.paper);
    await quantity(rowOf(page, 0), "2");
    await panel.getByRole("button", { name: "Add another item" }).click();
    await expect(panel.locator("[data-arrived-row]")).toHaveCount(2);
    expect(await sideways(page), "the form open").toBeLessThanOrEqual(0);
    const small = await panel.evaluate((box) => {
      const seen = [...box.querySelectorAll<HTMLElement>("[data-arrived-form] summary, [data-arrived-form] button, [data-arrived-form] input")];
      return seen.filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43.5).map((e) => `${e.tagName} ${e.textContent?.slice(0, 20)}`);
    });
    expect(small, "controls under 44 px").toEqual([]);
    await choose(rowOf(page, 1), ITEMS.pens);
    await quantity(rowOf(page, 1), "3");
    await shot(page, "form");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.locator("[data-said=arrived]")).toHaveText("Recorded: 2 items.");
    await expect(panel.locator("[data-arrived-move]")).toHaveCount(2);
    expect(await sideways(page), "what arrived").toBeLessThanOrEqual(0);
    await shot(page, "arrived-list");
  });
}
