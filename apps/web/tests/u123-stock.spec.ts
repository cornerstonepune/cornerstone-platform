/**
 * U123 — Stock and the buy list (specs/CP-82/spec.md, Done when 7 and 8 for the screens; 1 to 6 by what a keeper sees and does).
 *
 *  1. A keeper records stock in and sees the on-hand rise, hands out and sees it fall (and the word change), and the engine's refusals stand beside the field.
 *  2. A count with a difference above the tolerance asks for a reason; with it, the on-hand is what was counted and the history says so.
 *  3. The buy list shows a line whose need no class gave as "to confirm", the classes and activities of each line, and opens the engine's checklist link.
 *  4. A person who keeps no store sees no Stock line and is refused at its three addresses; a keeper sees only the campus they act for.
 *  5. At 1440 px and 400 px no page scrolls sideways; at 400 px Stock waits in the person's menu (the tab bar keeps its five) and the count's
 *     controls are 44 px tall, 8 px apart.
 *
 * Its own campus, keeper, class and items, new for each run (a stock move is never edited or deleted, so a campus's store must start empty): fake names,
 * placeholder emails. `SHOTS=<folder>` also saves a screenshot of each screen at both widths, for looking at.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { menu, sectionNames, SECTIONS, you } from "./menu";
import { aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const RUN = Date.now().toString(36);
const CAMPUS = `U123 Annexe ${RUN}`;
const OTHER = `U123 Annexe Two ${RUN}`;
const CLASS = "U123A";
const KEEPER = { email: `u123-keeper-${RUN}@cornerstone.test`, name: FAKE_STAFF[1], role: "ops", classes: [], subjects: [] };
const OUTSIDER = { email: `u123-educator-${RUN}@cornerstone.test`, name: FAKE_STAFF[2], role: "educator", classes: [], subjects: [] };
// each test has items of its own: what one does to an item is no business of another
const ITEMS = {
  paper: { code: `MAT-U123-${RUN}-1`, name: `U123 Chart paper ${RUN}`, unit: "sheet" },
  pens: { code: `MAT-U123-${RUN}-2`, name: `U123 Marker pens ${RUN}`, unit: "box" },
  glue: { code: `MAT-U123-${RUN}-3`, name: `U123 Glue sticks ${RUN}`, unit: "piece" },
  paint: { code: `MAT-U123-${RUN}-4`, name: `U123 Poster paint ${RUN}`, unit: "bottle" },
  hidden: { code: `MAT-U123-${RUN}-5`, name: `U123 Other campus tape ${RUN}`, unit: "roll" },
};
let tenant = "";
let keeper = "";
let campus = "";
let activity = { code: "", name: "" };
const lines: string[] = [];

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: width < 700 ? 800 : 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) {
    await page.waitForTimeout(500); // a panel fades in
    await page.screenshot({ path: path.join(process.env.SHOTS, `${name}-${page.viewportSize()?.width}.png`), fullPage: true });
  }
};
const card = (page: Page, code: string) => page.locator(`[data-items] [data-item="${code}"]`);
const onHand = (page: Page, code: string) => card(page, code).locator("[data-on-hand]");
const open = async (page: Page, code: string) => {
  await card(page, code).click();
  await expect(page.locator("[data-panel-title]")).toBeVisible();
};
const move = (kind: string, code: string, quantity: number, more: { class_label?: string } = {}) =>
  sql`insert into stock_move (tenant_id, campus_id, material_code, kind, quantity, class_label, staff_id)
      values (${tenant}, ${campus}, ${code}, ${kind}, ${quantity}, ${more.class_label ?? null}, ${keeper})`;

test.beforeAll(async () => {
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  for (const name of [CAMPUS, OTHER]) await sql`insert into campus (tenant_id, name) values (${tenant}, ${name}) on conflict (tenant_id, name) do nothing`;
  [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} and name = ${CAMPUS}`;
  const [{ id: other }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} and name = ${OTHER}`;
  keeper = (await aPerson(sql, KEEPER)).id;
  await sql`update staff set campus_id = ${campus} where id = ${keeper}`;
  await aPerson(sql, OUTSIDER);
  for (const i of Object.values(ITEMS)) await sql`insert into material_item (tenant_id, code, name, unit) values (${tenant}, ${i.code}, ${i.name}, ${i.unit}) on conflict do nothing`;
  // a class of the keeper's campus (the hand-out names one), and a class list of the month for the buy list
  const [{ id: cls }] = await sql<{ id: string }[]>`select test_fixture.class_of(${tenant}, ${CLASS}, 'K2')::text as id`;
  await sql`update school_class set campus_id = ${campus} where id = ${cls}`;
  [activity] = await sql<{ code: string; name: string }[]>`select code, name from activity where tenant_id = ${tenant} order by code limit 1`;

  // chart paper: held by no one yet, its minimum 20 → "none"; a spare item that is "enough", so the one that needs the keeper must come first
  await move("minimum", ITEMS.paper.code, 20);
  await move("in", ITEMS.pens.code, 50);
  // an item held at the other campus only: the keeper of this one never sees it
  await sql`insert into stock_move (tenant_id, campus_id, material_code, kind, quantity, staff_id) values (${tenant}, ${other}, ${ITEMS.hidden.code}, 'in', 7, ${keeper})`;

  // glue: 25 held, minimum 10, 40 needed by the class this month → to buy 25. Paint: the class gave no quantity → to confirm.
  await move("in", ITEMS.glue.code, 25);
  await move("minimum", ITEMS.glue.code, 10);
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const first = `${day.slice(0, 7)}-01`;
  const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10);
  await sql`insert into materials_list (tenant_id, school_class_id, period, from_on, to_on) values (${tenant}, ${cls}, 'fortnight', ${first}, ${last}) on conflict do nothing`;
  const [{ id: list }] = await sql<{ id: string }[]>`select id from materials_list where school_class_id = ${cls} and period = 'fortnight' and from_on = ${first} and to_on = ${last}`;
  const glue = await sql<{ id: string }[]>`insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on, activity_code, source)
    values (${tenant}, ${list}, ${ITEMS.glue.code}, ${ITEMS.glue.unit}, 40, ${day}, ${activity.code}, 'school') returning id::text`;
  const paint = await sql<{ id: string }[]>`insert into materials_line (tenant_id, list_id, material_code, unit, quantity, needed_on, source)
    values (${tenant}, ${list}, ${ITEMS.paint.code}, ${ITEMS.paint.unit}, null, ${day}, 'educator') returning id::text`;
  lines.push(glue[0].id, paint[0].id);
});
test.afterAll(async () => {
  // a class list's lines are taken off, so no other run's buy list for this class counts them
  await sql`update materials_line set removed_at = now() where id = any(${lines}::uuid[])`;
  await sql.end();
});

test("1. a keeper records stock in and sees the on-hand rise, hands out and sees it fall, with the engine's words beside the field", { tag: "@core" }, async ({ browser }) => {
  const page = await as(browser, KEEPER.email);
  await page.goto("/stock");
  await expect(page.getByRole("heading", { level: 1, name: "On hand" })).toBeVisible();
  await expect(page.locator("[data-stock-tabs] a[aria-current=page]")).toHaveText("On hand");
  // what needs the keeper comes first: the item with none, then the one that is enough; and nothing of the other campus
  await expect(page.locator("[data-items] [data-item]").first()).toHaveAttribute("data-item", ITEMS.paper.code);
  await expect(card(page, ITEMS.paper.code)).toContainText("none");
  await expect(card(page, ITEMS.pens.code)).toContainText("enough");
  await expect(card(page, ITEMS.hidden.code)).toHaveCount(0);
  await expect(onHand(page, ITEMS.paper.code)).toHaveText("0 sheet");

  await open(page, ITEMS.paper.code);
  const panel = page.locator("#detail-panel");
  // stock in: a word is not a quantity, and the engine says so beside the box; what was typed stays
  await panel.locator("[data-stock-form=in] summary").click();
  await panel.locator("[data-stock-form=in] [data-field=quantity] input").fill("many");
  await panel.getByRole("button", { name: "Record stock in" }).click();
  await expect(panel.locator('[data-stock-form=in] [data-field=quantity] [data-error]')).toContainText("must be a number above zero");
  await expect(panel.locator('[data-stock-form=in] [data-field=quantity] input')).toHaveValue("many");
  await panel.locator('[data-stock-form=in] [data-field=quantity] input').fill("25");
  await panel.getByRole("button", { name: "Record stock in" }).click();
  await expect(panel.locator("[data-said=in]")).toHaveText("Stock in recorded.");
  await expect(onHand(page, ITEMS.paper.code)).toHaveText("25 sheet");
  await expect(panel.locator("[data-item-standing]")).toContainText("enough");

  // hand out: a class the school has not got is refused beside its box; a real class lowers the on-hand, below the minimum it says low
  await panel.locator("[data-stock-form=out] summary").click();
  await panel.locator("[data-stock-form=out] [data-field=class_label] input").fill("ZZ99");
  await panel.locator("[data-stock-form=out] [data-field=quantity] input").fill("10");
  await panel.getByRole("button", { name: "Hand it out" }).click();
  await expect(panel.locator("[data-stock-form=out] [data-field=class_label] [data-error]")).toContainText("There is no class called ZZ99");
  await panel.locator("[data-stock-form=out] [data-field=class_label] input").fill(CLASS);
  await panel.getByRole("button", { name: "Hand it out" }).click();
  await expect(panel.locator("[data-said=out]")).toHaveText("Handed out.");
  await expect(onHand(page, ITEMS.paper.code)).toHaveText("15 sheet");
  await expect(card(page, ITEMS.paper.code)).toContainText("low");
  await shot(page, "on-hand-open");

  // the minimum, and a write-off that needs its reason
  await panel.locator("[data-stock-form=minimum] summary").click();
  await panel.locator("[data-stock-form=minimum] [data-field=minimum] input").fill("10");
  await panel.getByRole("button", { name: "Save the minimum" }).click();
  await expect(panel.locator("[data-said=minimum]")).toBeVisible();
  await expect(card(page, ITEMS.paper.code)).toContainText("enough");
  await panel.locator("[data-stock-form=writeoff] summary").click();
  await panel.locator("[data-stock-form=writeoff] [data-field=quantity] input").fill("2");
  await panel.getByRole("button", { name: "Write it off" }).click();
  await expect(panel.locator("[data-stock-form=writeoff] [data-field=reason] [data-error]")).toContainText("a write-off needs a reason");
  await panel.locator("[data-stock-form=writeoff] [data-field=reason] input").fill("Damaged");
  await panel.getByRole("button", { name: "Write it off" }).click();
  await expect(onHand(page, ITEMS.paper.code)).toHaveText("13 sheet");

  // the history reads in words
  await panel.getByRole("tab", { name: "History" }).click();
  const history = panel.locator("[data-history]");
  await expect(history).toContainText(`Written off 2 of ${ITEMS.paper.name} (sheet): Damaged`);
  await expect(history).toContainText(`Handed out 10 of ${ITEMS.paper.name} (sheet) to ${CLASS}`);
  await expect(history).toContainText(`Stock in: 25 of ${ITEMS.paper.name} (sheet)`);
  await page.context().close();
});

test("2. a count with a difference asks for a reason, and then the on-hand is what was counted", async ({ browser }) => {
  const page = await as(browser, KEEPER.email);
  await page.goto("/stock/count");
  await expect(page.getByRole("heading", { level: 1, name: "Count" })).toBeVisible();
  const books = page.locator(`[data-count-line="${ITEMS.pens.code}"]`);
  await expect(books).toContainText("The books say 50 box");
  await page.locator(`#counted-${ITEMS.pens.code}`).fill("20");
  await expect(page.locator(`[data-reason-for="${ITEMS.pens.code}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Save the count" }).click();
  // nothing is saved; the engine's words say which line and why, and a reason box opens under that line only
  await expect(page.locator("[data-refused]")).toContainText("Nothing was saved");
  await expect(page.locator("[data-refused]")).toContainText("Say why they differ");
  const why = page.locator(`[data-reason-for="${ITEMS.pens.code}"] input`);
  await expect(why).toBeVisible();
  await expect(page.locator("[data-reason-for]")).toHaveCount(1);
  await expect(page.locator(`#counted-${ITEMS.pens.code}`)).toHaveValue("20");
  await shot(page, "count-reason");
  await why.fill("Lost or misplaced");
  await page.getByRole("button", { name: "Save the count" }).click();
  await expect(page.locator("[data-counted]")).toContainText("30 fewer than the books said");
  await page.goto("/stock");
  await expect(onHand(page, ITEMS.pens.code)).toHaveText("20 box");
  await open(page, ITEMS.pens.code);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.locator("[data-history]")).toContainText("30 fewer than the books said: Lost or misplaced");
  await page.context().close();
});

test("3. the buy list says to confirm where a class gave no quantity, names each line's classes and activities, and opens the checklist", async ({ browser }) => {
  const page = await as(browser, KEEPER.email);
  await page.goto("/stock/buy");
  await expect(page.getByRole("heading", { level: 1, name: "Buy list" })).toBeVisible();
  await expect(page.locator("[data-stock-tabs] a[aria-current=page]")).toHaveText("Buy list");
  const glue = page.locator(`[data-line="${ITEMS.glue.code}"]`);
  await expect(glue).toContainText("25 piece"); // 40 needed + 10 minimum − 25 held
  await expect(glue).toContainText(CLASS);
  await expect(glue).toContainText(activity.name);
  const paint = page.locator(`[data-line="${ITEMS.paint.code}"]`);
  await expect(paint).toHaveAttribute("data-to-confirm", "yes");
  await expect(paint).toContainText("to confirm");
  await expect(paint).toContainText(CLASS);
  // the same WhatsApp checklist the inventory person gets, with these lines in it
  const send = page.getByRole("link", { name: "Send checklist" });
  await expect(send).toHaveAttribute("href", /^https:\/\/wa\.me\/\d*\?text=/);
  expect(decodeURIComponent((await send.getAttribute("href"))!)).toContain(`${ITEMS.glue.name}: 25 piece`);
  expect(decodeURIComponent((await send.getAttribute("href"))!)).toContain(`${ITEMS.paint.name}: quantity to confirm`);
  await shot(page, "buy-list");
  await page.context().close();
});

test("4. a person who keeps no store sees no Stock line and is refused at its addresses; a keeper sees only their campus", { tag: "@core" }, async ({ browser }) => {
  const outsider = await as(browser, OUTSIDER.email);
  await outsider.goto("/my-day");
  expect(await sectionNames(await menu(outsider))).toEqual([...SECTIONS.educator]);
  for (const address of ["/stock", "/stock/buy", "/stock/count"]) {
    await outsider.goto(address);
    await expect(outsider.getByRole("heading", { level: 1, name: "Not for you" }), address).toBeVisible();
    await expect(outsider.locator("main [role=status]")).toContainText("Nothing was shown or changed");
    await expect(outsider.locator("[data-stock-tabs]"), address).toHaveCount(0);
    await expect(outsider.locator("body"), address).not.toContainText(ITEMS.pens.name);
  }
  await outsider.context().close();

  const lead = await as(browser, KEEPER.email);
  await lead.goto("/stock");
  expect(await sectionNames(await menu(lead))).toEqual([...SECTIONS.coordinator]);
  await expect((await menu(lead)).locator("[aria-current=page] [data-section-label]")).toHaveText("Stock");
  // another campus's address changes nothing: the keeper's own store is what shows, and the other's item is not there
  await lead.goto(`/stock?campus=${encodeURIComponent(OTHER)}`);
  await expect(card(lead, ITEMS.pens.code)).toBeVisible();
  await expect(card(lead, ITEMS.hidden.code)).toHaveCount(0);
  await lead.context().close();
});

for (const width of [1440, 400]) {
  test(`5. at ${width} px the Stock pages do not scroll sideways, and on a phone Stock waits in the menu`, async ({ browser }) => {
    const page = await as(browser, KEEPER.email, width);
    for (const address of ["/stock", `/stock?open=item:${ITEMS.paper.code}`, "/stock/buy", "/stock/count"]) {
      await page.goto(address);
      await expect(page.locator("h1")).toBeVisible();
      expect(await noSidewaysScroll(page), address).toBe(true);
      await shot(page, `look-${address.replace(/\W+/g, "-").replace(/^-|-$/g, "")}`);
    }
    if (width === 400) {
      // the tab bar keeps its five; Stock is a line of the person's menu, beside Money
      await page.goto("/stock");
      expect(await (await menu(page)).getByRole("link").count()).toBeLessThanOrEqual(5);
      await expect(page.locator("nav[data-tabbar]").getByRole("link", { name: /^Stock/ })).toHaveCount(0);
      await expect((await you(page)).locator("[data-stock-link] a")).toHaveText("Stock");

      // the phone gate on the count: the heading within the top 240 px, every control 44 px tall and 8 px from the next
      await page.goto("/stock/count");
      expect((await page.getByRole("heading", { level: 1 }).boundingBox())!.y).toBeLessThan(240);
      const boxes = await page.locator("[data-count-form] :is(button, input, select, textarea)").evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ top: r.top, bottom: r.bottom, height: r.height })),
      );
      expect(boxes.length).toBeGreaterThanOrEqual(4);
      for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(44);
      const ordered = boxes.sort((a, b) => a.top - b.top);
      for (let i = 1; i < ordered.length; i++) expect(ordered[i].top - ordered[i - 1].bottom).toBeGreaterThanOrEqual(8);
      // stock in is a phone-gate form too: its fields and its button
      await page.goto(`/stock?open=item:${ITEMS.glue.code}`);
      await page.locator("[data-stock-form=in] summary").click();
      const form = await page.locator("[data-stock-form=in] :is(summary, button, input, select)").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.height));
      expect(form.length).toBeGreaterThanOrEqual(3);
      for (const h of form) expect(h).toBeGreaterThanOrEqual(44);
      await shot(page, "stock-in-form");
    } else {
      await expect((await you(page)).locator("[data-stock-link]")).toBeHidden();
    }
    await page.context().close();
  });
}
