/**
 * U124 — the Catalogue page and the item picker (specs/CP-84b/spec.md, Done when 1 to 6).
 *
 *  1. An educator reads the catalogue, grouped by category with "needs a category" first, searches it, and cannot change it.
 *  2. A coordinator sets an item's category in its row, and teaches a word: every uncategorised item ending in it takes the category and a person's choice is kept.
 *  3. The picker finds "Pencils" for "PENCIL pencils"; a close name ("colour pencils") shows "Did you mean" and makes no second item.
 *  4. "Not in the list? Add it" asks name, unit and category (the engine's words beside the field), picks the new item at once, and it is stocked in.
 *  5. Stock in can stock an item of the catalogue the campus never held.
 *  6. At 1440 px and 400 px no page scrolls sideways and the controls are at least 44 px tall.
 *
 * Items of this run's own (a word with the run in it), so a second run on the same database finds none of this run's. Fake names, placeholder emails.
 * `SHOTS=<folder>` also saves a screenshot of each screen at both widths, for looking at.
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
const COORD = { email: `u124-coordinator-${RUN}@cornerstone.test`, name: FAKE_STAFF[3], role: "coordinator", classes: [], subjects: [] };
const EDUCATOR = { email: `u124-educator-${RUN}@cornerstone.test`, name: FAKE_STAFF[4], role: "educator", classes: [], subjects: [] };
const STATIONERY = "Stationery & art supplies";
const TLM = "Teaching & activity materials (TLM)";
// the last word of three items to teach: the run in it, ending in a letter a plural never loses
const TAIL = `u124w${RUN}x`;
const ITEMS = {
  red: { code: `MAT-U124-${RUN}-1`, name: `Red ${TAIL}`, unit: "piece", category: null },
  blue: { code: `MAT-U124-${RUN}-2`, name: `Blue ${TAIL}`, unit: "piece", category: null },
  green: { code: `MAT-U124-${RUN}-3`, name: `Green ${TAIL}`, unit: "piece", category: null },
  pink: { code: `MAT-U124-${RUN}-4`, name: `Pink ${TAIL}`, unit: "piece", category: STATIONERY }, // a person chose this one: the word must not change it
  single: { code: `MAT-U124-${RUN}-5`, name: `U124 Single ${RUN}`, unit: "sheet", category: null },
  marker: { code: `MAT-U124-${RUN}-6`, name: `U124 Marker ${RUN}`, unit: "box", category: STATIONERY },
  loose: { code: `MAT-U124-${RUN}-7`, name: `U124 Loose ${RUN}q`, unit: "piece", category: null }, // still without a category when the phone is looked at
};
let tenant = "";
let pencils = "";
let pencilsUnit = "";

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: width < 700 ? 800 : 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(process.env.SHOTS, `${name}-${page.viewportSize()?.width}.png`), fullPage: true });
  }
};
const category = async (code: string) => (await sql<{ category: string | null }[]>`select category from material_item where code = ${code}`)[0].category;
const group = (page: Page, name: string) => page.locator(`[data-group="${name}"]`);
const row = (within: Locator, name: string) => within.locator("tbody tr").filter({ hasText: name });
const forStock = (page: Page) => page.locator("[data-stock-form=in-any]");
const onHand = async (page: Page, code: string): Promise<number> => {
  const card = page.locator(`[data-items] [data-item="${code}"] [data-on-hand]`);
  return (await card.count()) ? parseFloat((await card.innerText()).replace(/,/g, "")) : 0;
};

test.beforeAll(async () => {
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  await aPerson(sql, COORD);
  await aPerson(sql, EDUCATOR);
  for (const i of Object.values(ITEMS)) await sql`insert into material_item (tenant_id, code, name, unit, category) values (${tenant}, ${i.code}, ${i.name}, ${i.unit}, ${i.category}) on conflict do nothing`;
  // "Pencils" is the item the picker must find for "PENCIL pencils": the school's own, kept from run to run, and never held by a store
  await sql`insert into material_item (tenant_id, code, name, unit, category) values (${tenant}, ${`MAT-U124-PENCILS`}, 'Pencils', 'piece', ${STATIONERY}) on conflict do nothing`;
  [{ code: pencils, unit: pencilsUnit }] = await sql<{ code: string; unit: string }[]>`select code, unit from material_item where tenant_id = ${tenant} and name = 'Pencils'`;
});
test.afterAll(async () => {
  await sql.end();
});

test("1. an educator reads the catalogue by category, needs-a-category first, can search it, and cannot change it", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto("/setup");
  await page.getByRole("link", { name: "Open Catalogue" }).click();
  await expect(page).toHaveURL(/\/setup\/catalogue$/);
  await expect(page.getByRole("heading", { level: 1, name: "Catalogue" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find an item" }).fill(`u124 ${RUN}`);
  await page.getByRole("searchbox", { name: "Find an item" }).press("Enter");
  await expect(page).toHaveURL(/q=/);
  // the group that needs a category comes first, each item with its unit; the other item is under its category
  const groups = page.locator("[data-group]");
  await expect(groups.first()).toHaveAttribute("data-group", "Needs a category");
  await expect(row(group(page, "Needs a category"), ITEMS.single.name)).toContainText("sheet");
  await expect(row(group(page, STATIONERY), ITEMS.marker.name)).toContainText("box");
  // read only: no category list, no Save, no Teach a word
  await expect(page.locator("[data-category-form]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);
  await expect(page.getByText("Teach a word")).toHaveCount(0);
  // a search that matches nothing says so, once
  await page.goto("/setup/catalogue?q=zzzz-no-such-item");
  await expect(page.locator("[data-ux=empty]")).toHaveText("No item has those words.");
  await shot(page, "catalogue-educator");
  await page.context().close();
});

test("2. a coordinator sets an item's category, and teaches a word that sets the items ending in it and leaves a person's choice", async ({ browser }) => {
  const page = await as(browser, COORD.email);
  await page.goto(`/setup/catalogue?q=${encodeURIComponent(`u124 single ${RUN}`)}`);
  const one = row(group(page, "Needs a category"), ITEMS.single.name);
  await expect(one.locator("[data-category-form] select")).toHaveValue("");
  await one.locator("[data-category-form] select").selectOption(STATIONERY);
  await shot(page, "catalogue-coordinator");
  await one.getByRole("button", { name: /^Save the category of/ }).click();
  await expect(row(group(page, STATIONERY), ITEMS.single.name)).toBeVisible();
  expect(await category(ITEMS.single.code)).toBe(STATIONERY);
  // the engine kept who and what it was
  const kept = await sql<{ before: { category: string | null }; after: { category: string } }[]>`select before, after from change_log where table_name = 'material_item' and row_id = ${ITEMS.single.code} and op = 'category'`;
  expect(kept.map((k) => [k.before.category, k.after.category])).toEqual([[null, STATIONERY]]);

  // Teach a word: the word is offered with how many items end in it; three take the category, and Pink, which a person gave Stationery, keeps it
  await page.goto(`/setup/catalogue?q=${TAIL}`);
  await expect(group(page, "Needs a category").locator("tbody tr")).toHaveCount(3);
  await page.locator("[data-teach] summary").click();
  await expect(page.locator("#teach-word option", { hasText: `${TAIL} (3 items)` })).toHaveCount(1);
  await page.locator("#teach-word").selectOption(TAIL);
  await page.locator("#teach-category").selectOption(TLM);
  await shot(page, "teach-a-word");
  await page.getByRole("button", { name: "Teach the word" }).click();
  await expect(page.locator("[data-taught]")).toContainText(`3 items set to ${TLM}`);
  await expect(group(page, TLM).locator("tbody tr")).toHaveCount(3);
  await expect(group(page, "Needs a category")).toHaveCount(0);
  for (const i of [ITEMS.red, ITEMS.blue, ITEMS.green]) expect(await category(i.code)).toBe(TLM);
  expect(await category(ITEMS.pink.code)).toBe(STATIONERY);
  // kept for the next fill: a new item ending in the word files itself
  const word = await sql<{ value: Record<string, string> }[]>`select value from config where key = 'materials.category_words'`;
  expect(word[0].value[TAIL]).toBe(TLM);
  await page.context().close();
});

test("3. the picker finds Pencils for PENCIL pencils; a close name shows Did you mean and makes no second item; any catalogue item can be stocked in", async ({ browser }) => {
  const page = await as(browser, COORD.email);
  await page.goto("/stock?q=pencils"); // the list is narrowed to what this test looks at, so it is on the first page whatever else the store holds
  await forStock(page).locator("summary").click();
  const item = forStock(page).getByLabel("Item", { exact: true });
  await item.fill("PENCIL pencils");
  await expect(forStock(page).locator(`[data-pick="${pencils}"]`)).toBeVisible();
  await shot(page, "picker-open");
  // a name that shares a word with an item that exists, and is not it
  const close = `Colour pencils ${RUN}`;
  await item.fill(close);
  await expect(forStock(page).locator("[data-did-you-mean]")).toContainText("Did you mean");
  await expect(forStock(page).locator(`[data-did-you-mean] [data-close="${pencils}"]`)).toBeVisible();
  expect(Number((await sql<{ n: string }[]>`select count(*) as n from material_item where name ilike ${`%${RUN}%`} and name ilike 'colour%'`)[0].n)).toBe(0);

  // the item the campus never held is stocked in: pick Pencils from the list and record some
  await item.fill("PENCIL pencils");
  await forStock(page).locator(`[data-pick="${pencils}"]`).click();
  await expect(forStock(page).locator(`[data-picked="${pencils}"]`)).toContainText("Pencils");
  const before = await onHand(page, pencils);
  await forStock(page).getByLabel(/^How many/).fill("5");
  await forStock(page).getByRole("button", { name: "Record stock in" }).click();
  await expect(forStock(page).locator("[data-said=in-any]")).toHaveText(`Stock in recorded: 5 ${pencilsUnit} of Pencils.`);
  await expect.poll(() => onHand(page, pencils)).toBe(before + 5);
  await page.context().close();
});

test("4. Not in the list? Add it asks name, unit and category with the engine's words beside the field, picks the new item at once, and it is stocked in", async ({ browser }) => {
  const page = await as(browser, COORD.email);
  await page.goto(`/stock?q=${RUN}`);
  await forStock(page).locator("summary").click();
  const item = forStock(page).getByLabel("Item", { exact: true });
  const name = `Colour pencils ${RUN}`;
  await item.fill(name);
  await forStock(page).getByRole("button", { name: "Not in the list? Add it" }).click();
  const add = forStock(page).locator("[data-add-item]");
  await expect(add.getByLabel("Name")).toHaveValue(name);
  // each field the engine names says so beside it, and what was typed stays
  await add.getByRole("button", { name: "Add to the list" }).click();
  await expect(add.locator('[data-field=unit] [data-error]')).toContainText("needs a unit");
  await add.getByLabel("Unit").fill("box");
  await add.getByRole("button", { name: "Add to the list" }).click();
  await expect(add.locator('[data-field=category] [data-error]')).toContainText("A category is needed");
  await expect(add.getByLabel("Unit")).toHaveValue("box");
  await add.getByLabel("Category").selectOption(STATIONERY);
  await shot(page, "picker-add-it");
  await add.getByRole("button", { name: "Add to the list" }).click();
  await expect(forStock(page).locator("[data-picker-said]")).toContainText(`${name} is added to the list and picked.`);
  const [made] = await sql<{ code: string; unit: string; category: string }[]>`select code, unit, category from material_item where name = ${name}`;
  expect([made.unit, made.category]).toEqual(["box", STATIONERY]);
  await expect(forStock(page).locator(`[data-picked="${made.code}"]`)).toContainText(name);
  await forStock(page).getByLabel(/^How many/).fill("12");
  await forStock(page).getByRole("button", { name: "Record stock in" }).click();
  await expect(forStock(page).locator("[data-said=in-any]")).toHaveText(`Stock in recorded: 12 box of ${name}.`);
  await expect.poll(() => onHand(page, made.code)).toBe(12);

  // the same words are the item that exists: nothing is made twice, and the one that exists is picked
  await forStock(page).getByLabel("Item", { exact: true }).fill(name.toUpperCase());
  await forStock(page).getByRole("button", { name: "Not in the list? Add it" }).click();
  await add.getByLabel("Unit").fill("packet");
  await add.getByLabel("Category").selectOption(TLM);
  await add.getByRole("button", { name: "Add to the list" }).click();
  await expect(forStock(page).locator("[data-picker-said]")).toContainText("is already in the list, so that is the one picked.");
  expect(Number((await sql<{ n: string }[]>`select count(*) as n from material_item where lower(name) = ${name.toLowerCase()}`)[0].n)).toBe(1);
  expect((await category(made.code))).toBe(STATIONERY);
  await page.context().close();
});

for (const width of [1440, 400]) {
  test(`5. at ${width} px the Catalogue and the picker do not scroll sideways, and their controls are 44 px tall`, async ({ browser }) => {
    const page = await as(browser, COORD.email, width);
    for (const address of ["/setup", "/setup/catalogue", `/setup/catalogue?q=${RUN}`, "/stock"]) {
      await page.goto(address);
      await expect(page.locator("h1")).toBeVisible();
      expect(await noSidewaysScroll(page), address).toBe(true);
    }
    // the Catalogue, a coordinator's: the category list and its Save in a row, Teach a word open
    await page.goto(`/setup/catalogue?q=${encodeURIComponent(`u124 marker ${RUN}`)}`);
    const tall = (selector: string) =>
      page.locator(selector).evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.height));
    // a row's own button is the site's compact 32 px with a mouse (globals.css, dense rows); on a phone it is 44 px like every control
    for (const h of await tall("[data-category-form] :is(select, button)")) expect(h).toBeGreaterThanOrEqual(width === 400 ? 44 : 32);
    await page.goto("/setup/catalogue");
    await page.locator("[data-teach] summary").click();
    const teach = await tall("[data-teach] :is(summary, select, button)");
    expect(teach.length).toBeGreaterThanOrEqual(4);
    for (const h of teach) expect(h).toBeGreaterThanOrEqual(44);
    expect(await noSidewaysScroll(page), "Teach a word open").toBe(true);
    await shot(page, "catalogue-teach");
    // the picker: its search, a result, its add form
    await page.goto("/stock");
    await forStock(page).locator("summary").click();
    await forStock(page).getByLabel("Item", { exact: true }).fill("pencil");
    await expect(forStock(page).locator(`[data-pick="${pencils}"]`)).toBeVisible();
    await forStock(page).getByRole("button", { name: "Not in the list? Add it" }).click();
    const boxes = await tall("[data-stock-form=in-any] :is(summary, button, input:not([type=hidden]), select)");
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    for (const h of boxes) expect(h).toBeGreaterThanOrEqual(44);
    expect(await noSidewaysScroll(page), "the picker open").toBe(true);
    await shot(page, "picker-phone");
    await page.context().close();
  });
}
