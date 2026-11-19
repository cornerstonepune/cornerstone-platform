/**
 * U121 — Money, To approve and To pay (specs/CP-80/spec.md, Done when 2, 3 and 6 for these two pages): an operations lead approves or sends back the claims of
 * the campus they act for from a queue that opens the next claim by itself; a person who may not approve is refused; a founder marks an approved claim paid
 * with the date, how and the reference; at 1440 and at 400 px no page runs sideways and every control is at least 44 px.
 *
 * Its own rows: a campus of its own (so only its claims reach its operations leads), an educator who filed the claims, an operations lead, a founder.
 * Claims are put in as the rows the engine keeps (an `expense` filed under the rules in force), then decided through the pages. Names are from fake-names.
 * The bill's picture is the site's `/money/bill/<id>` (the claims page's route), so a test here does not rely on it loading.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aPerson } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const CAMPUS = "U121 Annexe";
const OTHER = "U121 Annexe Two";
const EDUCATOR = { email: "u121-educator@cornerstone.test", name: FAKE_STAFF[0], role: "educator", classes: [], subjects: [] };
const LEAD = { email: "u121-lead@cornerstone.test", name: FAKE_STAFF[1], role: "ops", classes: [], subjects: [] };
const LEAD_TWO = { email: "u121-lead-two@cornerstone.test", name: FAKE_STAFF[4], role: "ops", classes: [], subjects: [] };
const FOUNDER = { email: "u121-founder@cornerstone.test", name: FAKE_STAFF[2], role: "founder", classes: [], subjects: [] };
const COLLEAGUE = { email: "u121-colleague@cornerstone.test", name: FAKE_STAFF[3], role: "educator", classes: [], subjects: [] };
const FIRST = FAKE_STAFF[0].split(" ")[0];
const LAST = FAKE_STAFF[0].split(" ")[1];
const VENDOR = { a: "U121 Sai Stores", b: "U121 Maharashtra State Cooperative Stationery and Educational Supplies Wholesale Limited, Pune Branch No. 4", c: "U121 Third Stationers" };
let tenant = "";
const campus = { main: "", other: "" };
let educator = "";
const claim: Record<string, string> = {};

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
/** A look at a page, when `U121_SHOTS` names a folder: how these screens were checked by eye. */
const shot = async (page: Page, name: string) => {
  if (process.env.U121_SHOTS) await page.waitForTimeout(600); // a panel fades in
  if (process.env.U121_SHOTS) await page.screenshot({ path: path.join(process.env.U121_SHOTS, `${name}.png`) });
};
/** A claim as the engine keeps one filed `hoursAgo` hours ago under the rules in force now. */
async function file(vendor: string, amount: string, hoursAgo: number, o: { bill?: boolean; note?: string; campus?: string } = {}): Promise<string> {
  const [{ v }] = await sql<{ v: number }[]>`select count(*)::int + 1 as v from change_log where table_name = 'config' and row_id = 'money.rules' and op = 'set'`;
  const [row] = await sql<{ id: string }[]>`
    insert into expense (tenant_id, campus_id, claimant_id, spent_on, amount, vendor, category, note, receipt_key, rule_version, created_at)
    values (${tenant}, ${o.campus ?? campus.main}, ${educator}, '2026-11-10', ${amount}, ${vendor}, 'Materials', ${o.note ?? null}, ${o.bill === false ? null : "receipts/2026/u121.png"}, ${v},
            now() - ${hoursAgo} * interval '1 hour')
    returning id::text`;
  return row.id;
}
const decision = async (id: string) => (await sql<{ decision: string; reason: string | null }[]>`select decision, reason from approval where kind = 'expense' and target = ${id} order by seq desc limit 1`)[0];
const rows = (page: Page) => page.locator("[data-claim-list] [data-claim-row]");
const onClaim = (id: string) => new RegExp(`open=claim(%3A|:)${id}`);
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Every control on the page that a thumb presses, with its height. */
const tooSmall = (page: Page) =>
  page.evaluate(() => {
    const seen = [...document.querySelectorAll<HTMLElement>("main button, main input:not([type=hidden]), main select, main textarea, main summary, [data-claim-row], #detail-panel a.btn")];
    return seen.filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43.5).map((e) => `${e.tagName} ${e.textContent?.slice(0, 20)}`);
  });

test.beforeAll(async () => {
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant limit 1`;
  for (const name of [CAMPUS, OTHER]) await sql`insert into campus (tenant_id, name) values (${tenant}, ${name}) on conflict (tenant_id, name) do nothing`;
  [{ id: campus.main }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} and name = ${CAMPUS}`;
  [{ id: campus.other }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} and name = ${OTHER}`;
  educator = (await aPerson(sql, EDUCATOR)).id;
  for (const [p, at] of [[LEAD, campus.main], [LEAD_TWO, campus.other]] as const) {
    const { id } = await aPerson(sql, p);
    await sql`update staff set campus_id = ${at} where id = ${id}`;
  }
  await aPerson(sql, FOUNDER);
  await aPerson(sql, COLLEAGUE);
  // claims of an earlier run are taken back, so this run's queue holds only its own
  await sql`update expense set status = 'withdrawn' where claimant_id = ${educator} and status = 'submitted'`;
  claim.a = await file(VENDOR.a, "450.50", 3, { note: "Chart paper for the market project" });
  claim.b = await file(VENDOR.b, "450000.00", 2);
  claim.c = await file(VENDOR.c, "1200.00", 1, { bill: false });
});
test.afterAll(async () => {
  await sql.end();
});

test("an operations lead approves, sends back and the next claim opens by itself", async ({ browser }) => {
  const page = await as(browser, LEAD.email);
  await page.goto("/money/approve");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("To approve");
  // oldest first; who filed it by first name, never the whole name or an email; the amount in rupees; the bill's picture where there is one
  await expect(rows(page)).toHaveCount(3);
  expect(await rows(page).evaluateAll((r) => r.map((e) => e.textContent ?? ""))).toEqual([
    expect.stringContaining(VENDOR.a),
    expect.stringContaining(VENDOR.b),
    expect.stringContaining(VENDOR.c),
  ]);
  await expect(rows(page).nth(0)).toContainText(`${FIRST} · 10 Nov 2026`);
  await expect(rows(page).nth(0)).toContainText("₹450.50");
  await expect(rows(page).nth(1)).toContainText("₹4,50,000.00");
  await expect(rows(page).nth(0).locator('[data-bill]:not([data-bill="none"])')).toHaveCount(1);
  await expect(rows(page).nth(2).locator('[data-bill="none"]')).toHaveCount(1);
  expect(await page.locator("[data-claim-list]").textContent()).not.toContain(LAST);
  expect(await page.content()).not.toContain(EDUCATOR.email);
  await shot(page, "approve-1440-list");

  await rows(page).nth(0).click();
  await expect(page).toHaveURL(onClaim(claim.a));
  const panel = page.locator("#detail-panel");
  await expect(panel.locator("[data-panel-title]")).toHaveText(VENDOR.a);
  await expect(panel.locator("[data-claim-amount]")).toHaveText("₹450.50");
  await expect(panel).toContainText("Chart paper for the market project");
  await expect(panel.getByRole("link", { name: "Open the bill" })).toHaveAttribute("href", `/money/bill/${claim.a}`);
  await shot(page, "approve-1440-open");

  await panel.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(onClaim(claim.b));
  await expect(page.locator('[data-said="done"]')).toHaveText("Approved. 2 waiting for you.");
  await expect(page.locator(`[data-claim-row="${claim.a}"]`)).toHaveCount(0);
  await expect(panel.locator("[data-panel-title]")).toHaveText(VENDOR.b);
  expect(await decision(claim.a)).toMatchObject({ decision: "approved" });

  // Send back asks why, in place, and will not go without it
  await panel.locator("details[data-send-back] summary").click();
  await panel.getByRole("button", { name: "Send it back" }).click();
  await expect(page).toHaveURL(onClaim(claim.b));
  expect(await decision(claim.b)).toBeUndefined();
  await panel.getByRole("textbox").fill("The bill is not attached");
  await shot(page, "approve-1440-send-back");
  await panel.getByRole("button", { name: "Send it back" }).click();
  await expect(page).toHaveURL(onClaim(claim.c));
  await expect(page.locator('[data-said="done"]')).toHaveText("Sent back. 1 waiting for you.");
  expect(await decision(claim.b)).toMatchObject({ decision: "sent_back", reason: "The bill is not attached" });

  await panel.getByRole("button", { name: "Approve" }).click();
  await expect(page).not.toHaveURL(/open=/);
  await expect(page.getByText("Nothing is waiting for you.")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await shot(page, "approve-1440-empty");
});

test("the engine's own words are shown when a claim was decided meanwhile, and a person who may not decide is refused", async ({ browser }) => {
  const d = await file("U121 Decided Meanwhile", "99.00", 0.5);
  const one = await as(browser, LEAD.email);
  const two = await as(browser, FOUNDER.email);
  await one.goto(`/money/approve?open=claim:${d}`);
  await expect(one.locator("#detail-panel [data-panel-title]")).toHaveText("U121 Decided Meanwhile");
  await two.goto(`/money/approve?open=claim:${d}`);
  await two.locator("#detail-panel").getByRole("button", { name: "Approve" }).click();
  await expect(two.locator('[data-said="done"]')).toContainText("Approved.");
  await one.locator("#detail-panel").getByRole("button", { name: "Approve" }).click();
  await expect(one.locator(`[data-said="refused"]`)).toContainText("already approved");
  await expect(one.locator(`[data-claim-row="${d}"]`)).toHaveCount(0);
  await sql`update expense set status = 'withdrawn' where id = ${d}`; // not for the next test's list of what to pay

  for (const who of [EDUCATOR, COLLEAGUE]) {
    const nobody = await as(browser, who.email);
    await nobody.goto("/money/approve");
    await expect(nobody.getByRole("heading", { level: 1 })).toHaveText("Not for you");
    await expect(nobody.locator("[data-claim-list]")).toHaveCount(0);
    expect(await nobody.content()).not.toContain("U121 Sai Stores");
    await nobody.goto("/money/pay");
    await expect(nobody.getByRole("heading", { level: 1 })).toHaveText("Not for you");
  }
  const lead = await as(browser, LEAD.email);
  await lead.goto("/money/pay");
  await expect(lead.getByRole("heading", { level: 1 })).toHaveText("Not for you");
  // another campus's operations lead sees none of this campus's claims
  const elsewhere = await as(browser, LEAD_TWO.email);
  await elsewhere.goto("/money/approve");
  await expect(elsewhere.getByText("Nothing is waiting for you.")).toBeVisible();
});

test("a founder marks an approved claim paid with the date, how and the reference, and the next claim opens", async ({ browser }) => {
  const page = await as(browser, FOUNDER.email);
  await page.goto("/money/pay");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("To pay");
  // only approved claims, oldest first: the one sent back is not here
  await expect(page.locator(`[data-claim-row="${claim.b}"]`)).toHaveCount(0);
  const mine = [claim.a, claim.c];
  expect(await rows(page).evaluateAll((r, ids) => r.map((e) => e.getAttribute("data-claim-row")).filter((id) => ids.includes(id ?? "")), mine)).toEqual(mine);
  await page.locator(`[data-claim-row="${claim.a}"]`).click();
  await expect(page).toHaveURL(onClaim(claim.a));
  const panel = page.locator("#detail-panel");
  const amount = panel.locator("[data-claim-amount]");
  await expect(amount).toHaveText("₹450.50");
  expect(await amount.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(24);
  const today = await page.locator('input[name="paid_on"]').inputValue();
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(panel.locator('select[name="mode"]')).toHaveValue("UPI");
  await panel.getByLabel("Reference").fill("U121-UTR-1");
  await shot(page, "pay-1440-open");
  await panel.getByRole("button", { name: "Mark paid" }).click();
  await expect(page).toHaveURL(onClaim(claim.c));
  await expect(page.locator('[data-said="done"]')).toContainText("Marked paid.");
  const [paid] = await sql<{ paid_on: Date; payment_mode: string; payment_ref: string; paid_by: string }[]>`select to_char(paid_on, 'YYYY-MM-DD') as paid_on, payment_mode, payment_ref, paid_by::text from expense where id = ${claim.a}`;
  expect(paid).toMatchObject({ paid_on: today, payment_mode: "UPI", payment_ref: "U121-UTR-1" });

  // a reference of only spaces is the engine's to refuse, in its words, and the claim stays to be put right
  await panel.getByLabel("Reference").fill("   ");
  await panel.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.locator(`[data-said="refused"]`)).toContainText("reference");
  await expect(page.locator(`[data-claim-row="${claim.c}"]`)).toHaveCount(1);
  await page.locator(`[data-claim-row="${claim.c}"]`).click();
  await page.locator("#detail-panel").locator('select[name="mode"]').selectOption("Cash");
  await page.locator("#detail-panel").getByLabel("Reference").fill("U121-RCPT-9");
  await page.locator("#detail-panel").getByRole("button", { name: "Mark paid" }).click();
  await expect(page.locator(`[data-claim-row="${claim.c}"]`)).toHaveCount(0);
  expect((await sql`select payment_mode, payment_ref from expense where id = ${claim.c}`)[0]).toMatchObject({ payment_mode: "Cash", payment_ref: "U121-RCPT-9" });
  if ((await rows(page).count()) === 0) await expect(page.getByText("Nothing is waiting to be paid.")).toBeVisible();
  await shot(page, "pay-1440-after");
});

test("the worst case reads and works at 1440 and at 400 px: a very long vendor, an unbroken one, the largest amount", async ({ browser }) => {
  const long = await file("U121 Aaryavart Cooperative Stationery, Educational Supplies and Hardware Wholesale Merchants Limited, Pune Branch Number Four", "9999999999.99", 2, {
    note: "https://example.invalid/orders/2026/11/10/INVOICE-0000123456789-WITH-A-VERY-LONG-REFERENCE-THAT-CANNOT-BREAK",
  });
  const unbroken = await file("WWW.U121-STATIONERS-AND-SUPPLIES.EXAMPLE.CO.IN/ORDERS/2026/11/10/INVOICE-0000123456789", "7.50", 1, { bill: false });
  for (const width of [1440, 400]) {
    const lead = await as(browser, LEAD.email, width);
    await lead.goto("/money/approve");
    await expect(lead.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(lead.locator(`[data-claim-row="${long}"]`)).toContainText("₹9,99,99,99,999.99");
    expect(await sideways(lead)).toBeLessThanOrEqual(1);
    if (width === 400) expect(await tooSmall(lead)).toEqual([]);
    await shot(lead, `approve-${width}-worst-list`);
    await lead.locator(`[data-claim-row="${long}"]`).click();
    await expect(lead.locator("#detail-panel [data-claim-amount]")).toHaveText("₹9,99,99,99,999.99");
    expect(await sideways(lead)).toBeLessThanOrEqual(1);
    if (width === 400) expect(await tooSmall(lead)).toEqual([]);
    await shot(lead, `approve-${width}-worst-open`);
    await lead.locator("#detail-panel details[data-send-back] summary").click();
    expect(await sideways(lead)).toBeLessThanOrEqual(1);
    if (width === 400) expect(await tooSmall(lead)).toEqual([]);
    await lead.goto(`/money/approve?open=claim:${unbroken}`);
    expect(await sideways(lead)).toBeLessThanOrEqual(1);
    await lead.context().close();
  }
  // at 400 px the lead approves the largest claim and the founder pays it: every control a thumb's size
  const lead = await as(browser, LEAD.email, 400);
  await lead.goto(`/money/approve?open=claim:${long}`);
  await lead.locator("#detail-panel").getByRole("button", { name: "Approve" }).click();
  await expect(lead).toHaveURL(onClaim(unbroken));
  const founder = await as(browser, FOUNDER.email, 400);
  await founder.goto("/money/pay");
  await expect(founder.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(await sideways(founder)).toBeLessThanOrEqual(1);
  expect(await tooSmall(founder)).toEqual([]);
  await shot(founder, "pay-400-list");
  await founder.locator(`[data-claim-row="${long}"]`).click();
  await expect(founder).toHaveURL(onClaim(long));
  expect(await sideways(founder)).toBeLessThanOrEqual(1);
  expect(await tooSmall(founder)).toEqual([]);
  await shot(founder, "pay-400-open");
  await founder.locator("#detail-panel").getByLabel("Reference").fill("U121-UTR-LONG");
  await founder.locator("#detail-panel").getByRole("button", { name: "Mark paid" }).click();
  await expect(founder.locator(`[data-claim-row="${long}"]`)).toHaveCount(0);
  expect((await sql`select payment_ref from expense where id = ${long}`)[0].payment_ref).toBe("U121-UTR-LONG");
});

test("a long queue is read ten at a time and a claim named in the address opens on its own page", async ({ browser }) => {
  const ids: string[] = [];
  for (let i = 0; i < 23; i++) ids.push(await file(`U121 Queue ${String(i + 1).padStart(2, "0")}`, "10.00", 100 - i, { campus: campus.other, bill: false }));
  const page = await as(browser, LEAD_TWO.email);
  await page.goto("/money/approve");
  await expect(rows(page)).toHaveCount(10);
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("link", { name: "Later →" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await expect(rows(page).first()).toContainText("U121 Queue 11");
  await page.goto(`/money/approve?open=claim:${ids[22]}`);
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator(`[data-claim-row="${ids[22]}"]`)).toHaveAttribute("aria-current", "true");
  // the last claim decided, the next to open is the first that still waits
  await page.locator("#detail-panel").getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(onClaim(ids[0]));
});
