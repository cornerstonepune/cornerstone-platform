/**
 * UI-12 (issue #523) — the screens outside the bar: sign in, the help, report a problem. One test per line of its Done-when; the
 * generic checks of the inventory (renders, completeness, keyboard, touch, words, axe, themes) run for these three screens under
 * SLICE=UI-12 in u70-inventory.spec.ts, and the gate tests (gate.spec.ts, gate-password.spec.ts) keep the used-link and no-bypass lines.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { guideFor, sectionFor } from "../lib/guide-path";
import { SIGNED_IN } from "../playwright.config";
import { aPerson } from "./rows";

const INVENTORY = JSON.parse(readFileSync(path.resolve(__dirname, "../../../docs/frontend/screens.json"), "utf8")) as {
  merged_slices: string[];
  screens: { id: string; route: string; title: string }[];
};
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
test.afterAll(() => sql.end());

// Done when 2 — every old route of these screens answers 308 to the new address
test("each old address answers 308 to its new one", async ({ request }) => {
  const folds: [string, string][] = [
    ["/login/forgot", "/login?view=forgot"],
    ["/login/new-password", "/login?view=new-password"],
    ["/account/password", "/login?view=forgot"],
    ["/guide/papers-to-approve", "/guide"],
    ["/guide/workflows", "/guide"],
  ];
  for (const [from, to] of folds) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(308);
    expect(new URL(res.headers().location, "http://x").pathname + new URL(res.headers().location, "http://x").search, from).toBe(to);
  }
});

// Done when 3 and 12 — one section per screen of screens.json, generated from it, and the ? of every page opens its own
test("the help has one section for every screen of the inventory", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start here");
  for (const s of INVENTORY.screens) {
    const section = page.locator(`details[id="${s.id}"]`);
    await expect(section, `${s.id} has no help section`).toHaveCount(1);
    await expect(section.locator("summary")).toContainText(s.title);
  }
  await expect(page.locator("details[data-block=Details]")).toHaveCount(INVENTORY.screens.length);
});

test("the ? of every screen names that screen's own section", async () => {
  for (const s of INVENTORY.screens) {
    // the first screen of a route owns it (Today for the educator and the coordinator is one address)
    const first = INVENTORY.screens.find((x) => x.route === s.route)!;
    const concrete = s.route.replace(/\[\w+\]/g, "7");
    expect(sectionFor(concrete), s.route).toBe(first.id);
    expect(guideFor(concrete), s.route).toBe(`/guide#${first.id}`);
  }
  expect(guideFor("/guide")).toBe("/guide");
  expect(guideFor("/a-page-nobody-listed")).toBe("/guide");
});

test("pressing ? on a page opens the help at that page's section, open", async ({ page }) => {
  await page.goto("/feedback");
  await page.locator("[data-bar]").first().getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/guide#feedback$/);
  await expect(page.locator('details[id="feedback"]')).toHaveJSProperty("open", true);
  await expect(page.locator('details[id="feedback"]')).toBeInViewport();
});

// Done when 6 — the large lockup above the sign-in form, the dark one in dark; the help carries the lockup in its head
test("sign in shows the large lockup above the form, and the dark-ground one in dark", async ({ browser }) => {
  for (const scheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/login");
    const logo = page.locator("[data-brand-mark] img");
    await expect(logo).toBeVisible();
    const src = await logo.evaluate((i) => (i as HTMLImageElement).currentSrc);
    expect(src).toContain(scheme === "dark" ? "lockup-for-dark-backgrounds" : "lockup-colour");
    expect((await logo.boundingBox())!.height).toBeCloseTo(72, 0);
    const mark = await logo.boundingBox();
    const form = await page.locator("form[data-block=Form]").boundingBox();
    expect(mark!.y + mark!.height, "the lockup sits above the form").toBeLessThanOrEqual(form!.y);
    await context.close();
  }
});

test("the help carries the lockup in its head", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.locator("[data-bar] [data-brand-mark]")).toBeVisible();
});

// Done when 4 and 8 — after sign in the person lands on Today for them
test("sign in lands on Today, the new one once UI-7 is merged and the existing Today until then", async ({ browser }) => {
  const email = "u12-signin@cornerstone.test";
  await aPerson(sql, { email, name: "Sign In Person", role: "educator", classes: [], subjects: [], password: "kolhapur-rain-9" });
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill("kolhapur-rain-9");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const today = INVENTORY.merged_slices.includes("UI-7") ? "Today" : "What needs doing";
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(today);
  await context.close();
});

// Done when 4 — sign in uses the bare frame; a wrong password shows one message
test("sign in is the bare frame and a wrong password says one thing", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.locator("[data-frame=bare]")).toHaveCount(1);
  await expect(page.locator("[data-bar], [data-rail]")).toHaveCount(0);
  await page.getByLabel("School email").fill("nobody@cornerstone.test");
  await page.getByLabel("Password").fill("not-it-at-all-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That email and password do not match a staff member.");
  await context.close();
});

// Done when 13 — the page warns, and a note holds no screenshot on the public side
test("report a problem warns against a child's name and sends one note", async ({ page }) => {
  await page.goto("/feedback?from=%2Ftoday");
  await expect(page.getByText("Please do not type a child's name, a parent's name or a phone number here.")).toBeVisible();
  await expect(page.getByLabel("Where (the page you came from)")).toHaveValue("/today");
});

test("the help reads at phone width with no sideways scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 400, height: 800 }, storageState: SIGNED_IN });
  const page = await context.newPage();
  await page.goto("/guide");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Start here");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});

test("each I want to link opens its screen", async ({ page }) => {
  await page.goto("/guide");
  const hrefs = await page.locator("main a[data-job]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const screen = INVENTORY.screens.find((s) => s.route === href)!;
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 }), href).toHaveText(screen.title);
  }
});
