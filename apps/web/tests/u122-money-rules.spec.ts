/**
 * U122 — The money rules screen (specs/CP-80/spec.md, Done when 4 and 6): a co-founder changes a limit and the categories and reads what changed in
 * words below; rules that cannot work are refused in the engine's words and nothing is lost; a person who may not change the rules reads them and
 * cannot; at 400 px the screen renders, has one h1, does not scroll sideways and every control is at least 44 px.
 *
 * Its own people (fake names, never a real one): a co-founder (a coordinator who also holds the `founder` role, as the three co-founders do) and
 * an educator. The rules and the categories the run finds are put back after it; the history, which is never edited, keeps what the run changed.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const FOUNDER = { email: "u122-founder@cornerstone.test", name: FAKE_STAFF[0], role: "coordinator", classes: [], subjects: [] };
const EDUCATOR = { email: "u122-educator@cornerstone.test", name: FAKE_STAFF[1], role: "educator", classes: [], subjects: [] };
const KEYS = ["money.rules", "money.categories"];
const kept: Record<string, string> = {};
const NEW = "U122 Transport";
const LIMIT = "Take a payment screenshot as the bill up to";
// roles, not labels or markup: while Next streams a page the same form is also in a hidden copy that a label or a selector would find twice
const limitField = (page: Page) => page.getByRole("spinbutton", { name: LIMIT });
const addField = (page: Page) => page.getByRole("textbox", { name: "Add a category" });
const categories = (page: Page) => page.locator("[data-category]:visible");
const saveButton = (page: Page) => page.getByRole("button", { name: "Save the rules" });
const rupeesSaid = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeAll(async () => {
  for (const r of await sql<{ key: string; value: string }[]>`select key, value::text as value from config where key = any(${KEYS})`) kept[r.key] = r.value;
  for (const p of [FOUNDER, EDUCATOR]) await aPerson(sql, p);
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  // a grant is never reopened, so one still in force from an earlier run is kept and an ended one is not touched
  await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'founder', current_date, 'u122 test' from pii.staff ps where ps.email = ${FOUNDER.email}
    and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.role_code = 'founder' and g.granted_by = 'u122 test'
                    and (g.valid_to is null or g.valid_to > current_date))`;
});
test.afterAll(async () => {
  for (const [key, value] of Object.entries(kept)) await sql`update config set value = ${sql.json(JSON.parse(value))} where key = ${key}`;
  await sql`update staff_role_grant set valid_to = current_date + 1 where granted_by = 'u122 test' and valid_to is null`; // ended, never deleted
  await sql.end();
});

test("4. a founder changes a limit and the categories, and the history says what changed in words", async ({ browser }) => {
  const page = await as(browser, FOUNDER.email);
  // the Setup page has the card for a person who may change the rules, and it opens the screen
  await page.goto("/setup");
  await page.getByRole("link", { name: "Open Money rules" }).click();
  await expect(page).toHaveURL(/\/money\/rules$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Money rules");

  const limit = limitField(page);
  const was = Number(await limit.inputValue());
  await limit.fill(String(was + 1));
  // Enter in the box adds the category; it does not save the rules
  await addField(page).fill(NEW);
  await addField(page).press("Enter");
  await expect(categories(page).filter({ hasText: NEW })).toBeVisible();
  await expect(page).not.toHaveURL(/saved=1/);
  await addField(page).fill(NEW.toLowerCase());
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("is already in the list")).toBeVisible();
  await page.getByRole("button", { name: `Move ${NEW} up` }).click();
  await expect(categories(page).last()).not.toHaveAttribute("data-category", NEW);
  await page.getByRole("button", { name: `Move ${NEW} down` }).click();
  await expect(categories(page).last()).toHaveAttribute("data-category", NEW);
  await page.getByRole("textbox", { name: "Why are you changing them?" }).fill("U122 a test change");
  await page.screenshot({ path: "test-results/u122-rules-1440.png", fullPage: true }); // for a person to look at
  await saveButton(page).click();

  await expect(page).toHaveURL(/saved=1/);
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await expect(limitField(page)).toHaveValue(String(was + 1));
  await expect(categories(page).filter({ hasText: NEW })).toBeVisible();
  const history = page.locator("[data-change]");
  await expect(history.first()).toContainText(FAKE_STAFF[0].split(" ")[0]);
  await expect(page.locator("[data-section=history]")).toContainText(`raised the payment-screenshot limit from ${rupeesSaid(was)} to ${rupeesSaid(was + 1)}`);
  await expect(page.locator("[data-section=history]")).toContainText(`added the category “${NEW}”`);
  await expect(page.locator("[data-section=history]")).toContainText("Because: U122 a test change");

  // and back again: the limit lowered and the category taken off, newest first
  await limitField(page).fill(String(was));
  await page.getByRole("button", { name: `Remove ${NEW}` }).click();
  await expect(categories(page).filter({ hasText: NEW })).toHaveCount(0);
  await saveButton(page).click();
  await expect(page.locator("[data-change]").first()).toContainText(`removed the category “${NEW}”`);
  await expect(page.locator("[data-section=history]")).toContainText(`lowered the payment-screenshot limit from ${rupeesSaid(was + 1)} to ${rupeesSaid(was)}`);
  await expect(limitField(page)).toHaveValue(String(was));
});

test("4. rules that cannot work are refused in the engine's words at the top, and what was typed stays", async ({ browser }) => {
  const page = await as(browser, FOUNDER.email);
  await page.goto("/money/rules");
  const approver = page.getByRole("combobox", { name: "Who approves: an expense" });
  const before = await approver.inputValue();
  await approver.selectOption({ label: "an educator" });
  await saveButton(page).click();
  const refused = page.getByRole("alert").filter({ hasText: "The rules were not saved" });
  await expect(refused).toContainText("An expense is approved by an educator, who may not approve claims.");
  await expect(refused).not.toContainText(/expense_|float_topup|capex|_/); // no code is shown to a person
  await expect(approver).toHaveValue("educator"); // what was typed stays
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Who approves: an expense" })).toHaveValue(before); // and nothing was saved
});

test("4. a person who may not change the rules reads them and cannot change them", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  await page.goto("/money/rules");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Money rules");
  await expect(page.getByText("Only the co-founders change these rules")).toBeVisible();
  await expect(page.getByText("Flag a bill still missing after")).toBeVisible();
  await expect(page.getByText("An expense is approved by")).toBeVisible();
  await expect(categories(page).first()).toBeVisible();
  await expect(page.locator("[data-rules-form] :is(input, select, textarea)")).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
  await expect(page.locator("[data-section=history]")).toBeVisible();
  // the Setup page offers the card only to a person who may change the rules
  await page.goto("/setup");
  await expect(page.getByRole("link", { name: "Open Money rules" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/u122-rules-read-1440.png", fullPage: true });
});

test("6. at 400 px the screen renders, has one h1, does not scroll sideways and every control is at least 44 px", async ({ browser }) => {
  for (const email of [FOUNDER.email, EDUCATOR.email]) {
    const page = await as(browser, email, 400);
    await page.goto("/money/rules");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    if (email === FOUNDER.email) {
      // the worst the screen is asked to hold: thirty categories, the longest name the engine takes, the biggest limit
      for (let i = 1; i <= 30; i++) {
        await addField(page).fill(`U122 category ${i}`);
        await addField(page).press("Enter");
      }
      const long = "Annual-day-decorations-and-stage-materials-for-the-hall-2026".slice(0, 60);
      await addField(page).fill(long);
      await addField(page).press("Enter");
      await limitField(page).fill("99999999");
      await page.getByRole("button", { name: `Move ${long} up` }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: `Remove ${long}` })).toBeInViewport({ ratio: 1 });
    }
    expect(await sideways(page), `${email} scrolls sideways at 400`).toBeLessThanOrEqual(1);
    const small = await page.locator("[data-rules-form] :is(input, select, button)").evaluateAll((els) =>
      els.map((e) => ({ name: e.getAttribute("aria-label") ?? e.id ?? e.tagName, h: e.getBoundingClientRect().height })).filter((c) => c.h > 0 && c.h < 43.5),
    );
    expect(small, "controls under 44 px").toEqual([]);
    await page.screenshot({ path: `test-results/u122-rules-400-${email === FOUNDER.email ? "founder" : "read"}.png`, fullPage: true });
  }
  const wide = await as(browser, FOUNDER.email);
  await wide.goto("/money/rules");
  expect(await sideways(wide), "scrolls sideways at 1440").toBeLessThanOrEqual(1);
});
