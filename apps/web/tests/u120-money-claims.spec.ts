/**
 * U120 — Money, My claims and File a claim (specs/CP-80/spec.md): one test per Done-when line of these two screens, by what a person sees and does.
 *
 *  1. A member of staff files a claim with a bill photo, sees it in My claims in words, withdraws it, adds a bill later, and files again a
 *     claim that was sent back (the form comes filled in).
 *  5. The tabs: a member of staff who may neither approve nor pay sees My claims and Rules, and no To approve or To pay.
 *  6. At 1440 px and at 400 px: no sideways scroll, with the worst-case claim (a very long vendor, a very large amount) and with many claims;
 *     on File a claim at 400 px every control is at least 44 px tall with 8 px between.
 *
 * Its own people, new for each run (a claim is never deleted, so a person's list must start empty): fake names, placeholder emails.
 * `SHOTS=<folder>` also saves a screenshot of each screen at both widths, for looking at.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const RUN = Date.now().toString(36);
const CLAIMANT = { email: `u120-claimant-${RUN}@cornerstone.test`, name: FAKE_STAFF[1], role: "educator", classes: [], subjects: [] };
const LEAD = { email: `u120-lead-${RUN}@cornerstone.test`, name: FAKE_STAFF[2], role: "educator", classes: [], subjects: [] };
// a one-pixel picture: a real PNG, so the bill the page shows back can be told from a broken image
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const BILL = { name: "bill.png", mimeType: "image/png", buffer: PNG };
const LONG_VENDOR = "Maharashtra State Electricity Distribution Company Limited Pune Rural Circle Office Annex";

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: width < 700 ? 800 : 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `${name}-${page.viewportSize()?.width}.png`), fullPage: true });
};
const claimId = (page: Page) => new URL(page.url()).searchParams.get("open")!.replace("claim:", "");

/** Fill File a claim; the bill is a real file chosen the way the page takes one. */
async function fill(page: Page, over: { vendor?: string; amount?: string; bill?: boolean } = {}) {
  if (over.bill !== false) await page.locator('input[data-bill-input="file"]').setInputFiles(BILL);
  await page.getByLabel("Amount (₹)").fill(over.amount ?? "450.50");
  await page.getByLabel("Who was paid").fill(over.vendor ?? "Sai Stores");
  await page.getByLabel("What for").selectOption("Materials");
  const campus = page.getByLabel("Campus");
  if (await campus.count()) await campus.selectOption({ index: 1 });
}

test.beforeAll(async () => {
  await aPerson(sql, CLAIMANT);
  await aPerson(sql, LEAD);
});
test.afterAll(async () => {
  // a claim is never deleted, so what this run filed is withdrawn: no other spec or engine test finds it waiting in a queue
  await sql`update expense set status = 'withdrawn' where status = 'submitted' and claimant_id in (select staff_id from pii.staff where email in (${CLAIMANT.email}, ${LEAD.email}))`;
  await sql.end();
});

test("1. a member of staff files a claim with a bill, sees it in words, adds a bill later and withdraws a claim", async ({ browser }) => {
  const page = await as(browser, CLAIMANT.email);
  await page.goto("/money");
  await expect(page.getByRole("heading", { level: 1, name: "My claims" })).toBeVisible();
  await expect(page.getByText("You have not filed a claim yet")).toBeVisible();
  await page.getByRole("link", { name: "New claim" }).first().click();
  await expect(page).toHaveURL(/\/money\/new/);

  // a refusal stands beside its field, and keeps what was typed
  await page.getByLabel("Who was paid").fill("Sai Stores");
  await page.getByLabel("What for").selectOption("Materials");
  const campus = page.getByLabel("Campus");
  if (await campus.count()) await campus.selectOption({ index: 1 });
  await page.getByRole("button", { name: "File the claim" }).click();
  await expect(page.locator('[data-field="amount"] [data-error]')).toContainText("more than nothing");
  await expect(page.getByLabel("Who was paid")).toHaveValue("Sai Stores");

  await fill(page);
  await expect(page.locator("[data-bill-chosen]")).toContainText("bill.png");
  await page.getByRole("button", { name: "File the claim" }).click();

  // back on My claims with the new card open, and the line that says where it is
  await expect(page).toHaveURL(/\/money\?open=claim:/);
  await expect(page.locator('[data-said="filed"]')).toHaveText("Filed. It is with your operations lead.");
  await expect(page.locator("[data-panel-title]")).toHaveText("Sai Stores");
  const card = page.locator("[data-claims] [data-claim]");
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("₹450.50");
  await expect(card).toContainText("Submitted");
  await expect(card).toContainText("Waiting for your campus's operations lead");
  await expect(page.locator("[data-claim-standing]")).toContainText("Waiting for your campus's operations lead");
  await shot(page, "my-claims-open");

  // the bill is kept and shows back as a picture
  await page.getByRole("tab", { name: "Bill" }).click();
  const picture = page.locator("[data-bill-picture] img");
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // withdraw: it stays, in words
  await page.getByRole("button", { name: "Withdraw" }).click();
  await expect(page.locator('[data-said="withdrawn"]')).toBeVisible();
  await expect(page.locator('[data-claims] [data-claim="withdrawn"]')).toContainText("Withdrawn");
  await expect(page.getByRole("button", { name: "Withdraw" })).toHaveCount(0);

  // a claim filed with no bill says so and takes the bill later
  await page.goto("/money/new");
  await fill(page, { vendor: "Ravi Traders", amount: "1200", bill: false });
  await page.getByRole("button", { name: "File the claim" }).click();
  await expect(page.locator("[data-panel-title]")).toHaveText("Ravi Traders");
  await expect(page.getByText("None yet")).toBeVisible();
  await page.locator("[data-bill-input]").setInputFiles(BILL);
  await expect(page.getByText("Kept")).toBeVisible();
  await expect(page.locator("[data-add-bill]")).toHaveCount(0);
  await page.context().close();
});

test("1b. a sent-back claim says why, and File it again opens the form filled in", async ({ browser }) => {
  const page = await as(browser, CLAIMANT.email);
  await page.goto("/money");
  await page.locator("[data-claims] [data-claim]", { hasText: "Ravi Traders" }).click();
  await expect(page).toHaveURL(/open=claim(:|%3A)/);
  const id = claimId(page);
  const [lead] = await sql<{ id: string }[]>`select staff_id::text as id from pii.staff where email = ${LEAD.email}`;
  const [{ tenant_id }] = await sql<{ tenant_id: string }[]>`select tenant_id from expense where id = ${id}`;
  await sql`insert into approval (tenant_id, kind, target, decision, by, reason, detail)
            values (${tenant_id}, 'expense', ${id}, 'sent_back', ${lead.id}, 'the bill is blurred', '{"amount": 1200, "rule_version": 1}'::jsonb)`;
  await page.reload();
  const card = page.locator('[data-claims] [data-claim="sent back"]');
  await expect(card).toContainText("Sent back");
  await expect(card).toContainText("the bill is blurred");
  await page.locator("[data-file-again]").click();
  await expect(page).toHaveURL(/\/money\/new\?from=/);
  await expect(page.getByLabel("Who was paid")).toHaveValue("Ravi Traders");
  await expect(page.getByLabel("Amount (₹)")).toHaveValue("1200.00");
  await expect(page.getByLabel("What for")).toHaveValue("Materials");
  await page.getByLabel("Amount (₹)").fill("1250");
  const campus = page.getByLabel("Campus");
  if (await campus.count()) await expect(campus).toHaveValue(/.+/);
  await page.getByRole("button", { name: "File the claim" }).click();
  await expect(page.locator("[data-panel-title]")).toHaveText("Ravi Traders");
  await expect(page.locator("[data-claim-standing]")).toContainText("Submitted");
  await expect(page.locator("[data-claim-standing]")).toContainText("operations lead");
  await page.context().close();
});

test("5. a member of staff who may neither approve nor pay sees My claims and Rules, and no other tab", async ({ browser }) => {
  const page = await as(browser, CLAIMANT.email);
  await page.goto("/money");
  const tabs = page.locator("[data-money-tabs] a");
  await expect(tabs.filter({ hasText: "My claims" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.filter({ hasText: "Rules" })).toHaveCount(1);
  await expect(tabs.filter({ hasText: "To approve" })).toHaveCount(0);
  await expect(tabs.filter({ hasText: "To pay" })).toHaveCount(0);
  await page.goto("/money/new");
  await expect(tabs.filter({ hasText: "My claims" })).toHaveAttribute("aria-current", "page");
  await page.context().close();
});

for (const width of [1440, 400]) {
  test(`6. at ${width} px My claims and File a claim do not scroll sideways, worst case included`, async ({ browser }) => {
    const page = await as(browser, CLAIMANT.email, width);
    // the worst case a person can file: a vendor with no short words, an amount in crores, a note at its limit
    await page.goto("/money/new");
    await fill(page, { vendor: LONG_VENDOR.slice(0, 120), amount: "99999999.99" });
    await page.getByLabel("Note (optional)").fill("x".repeat(400));
    await page.getByRole("button", { name: "File the claim" }).click();
    await expect(page).toHaveURL(/\/money\?open=claim:/);
    await expect(page.locator("[data-claims] [data-claim]").first()).toContainText("₹9,99,99,999.99");
    expect(await noSidewaysScroll(page)).toBe(true);
    await shot(page, "my-claims-worst-case");

    // more than a page of claims: ten a page, the rest a link away
    const [{ tenant_id, id, claimant_id, campus_id }] = await sql<{ tenant_id: string; id: string; claimant_id: string; campus_id: string }[]>`select * from expense order by created_at desc limit 1`;
    if (width === 1440)
      await sql`insert into expense (tenant_id, campus_id, claimant_id, spent_on, amount, vendor, category, rule_version)
                select ${tenant_id}, ${campus_id}, ${claimant_id}, '2026-11-10', 10 + n, 'Stationery shop ' || n, 'Printing', 1 from generate_series(1, 14) n`;
    await page.goto("/money");
    await expect(page.locator("[data-claims] [data-claim]")).toHaveCount(10);
    await expect(page.getByRole("link", { name: "Older" })).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.goto(`/money?open=claim:${id}`);
    await expect(page.locator("[data-panel-title]")).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    await shot(page, "my-claims-panel");

    await page.goto("/money/new");
    await expect(page.getByRole("heading", { level: 1, name: "File a claim" })).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    await shot(page, "file-a-claim");
    if (width === 400) {
      // the phone gate: the heading within the top 240 px, every control 44 px tall and 8 px from the next
      expect((await page.getByRole("heading", { level: 1 }).boundingBox())!.y).toBeLessThan(240);
      const boxes = await page.locator("[data-claim-form] :is(button, input:not([hidden]):not([type=hidden]), select, textarea)").evaluateAll((els) =>
        els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ top: r.top, bottom: r.bottom, height: r.height })),
      );
      expect(boxes.length).toBeGreaterThanOrEqual(7);
      for (const b of boxes) expect(b.height).toBeGreaterThanOrEqual(44);
      const ordered = boxes.sort((a, b) => a.top - b.top);
      for (let i = 1; i < ordered.length; i++) expect(ordered[i].top - ordered[i - 1].bottom).toBeGreaterThanOrEqual(8);
    }
    await page.context().close();
  });
}
