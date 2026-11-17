/**
 * U13 (UI-13) — the frame. One test or more per Done-when line of specs/UI-13/spec.md (the number is in the title).
 */
import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { inventoryRows, signedInAs, type Rows } from "./inventory-fixtures";
import { brandRules } from "./inventory/brand";
import { addressToLookIn, type Seen } from "./u13-address";
import { BAR_LOGO_PX } from "../lib/ux-rules";
import { litSection, menu } from "./menu";

const WEB = path.resolve(__dirname, "..");
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let rows: Rows;
test.beforeAll(async () => {
  rows = await inventoryRows(sql);
});
test.afterAll(async () => {
  await sql.end();
});

test("1. the four shells, the old menu and the second icon file are gone, and no page names the old blocks", () => {
  for (const f of ["components/educator/shell.tsx", "components/shell.tsx", "components/page-shell.tsx", "components/top-bar.tsx", "components/educator/shell-nav.tsx", "lib/educator/menu.ts", "components/icons.tsx", "components/logo.tsx", "components/educator/crumbs.tsx", "public/brand/cornerstone-mark.svg"])
    expect(existsSync(path.join(WEB, f)), f).toBe(false);
  expect(existsSync(path.join(WEB, "components/app-frame.tsx"))).toBe(true);
  expect(existsSync(path.join(WEB, "components/trail.tsx"))).toBe(true);
  expect(existsSync(path.join(WEB, "components/brand-mark.tsx"))).toBe(true);
  let left = "";
  try {
    left = execFileSync("grep", ["-rlE", "PageShell|TopBar|ShellNav", ".", "--include=*.ts", "--include=*.tsx", "--exclude-dir=node_modules", "--exclude-dir=.next", "--exclude-dir=.next-test", "--exclude=u13-frame.spec.ts"], { cwd: WEB, encoding: "utf8" });
  } catch {
    left = ""; // grep exits 1 when nothing matches
  }
  expect(left.trim(), "files that still name PageShell, TopBar or ShellNav").toBe("");
});

test("1. every existing page renders inside AppFrame (the bar, the trail, one main)", async ({ page }) => {
  for (const route of ["/today", "/children/assessments", "/timetable", "/children", "/library", "/setup/classes", "/setup/curriculum", "/guide"]) {
    await page.goto(route);
    await expect(page.locator("[data-frame] [data-bar]").first(), route).toBeVisible();
    await expect(page.getByRole("main"), route).toHaveCount(1);
    // the one menu is the sidebar's (page charter A1); a page's right side is its rail or its detail panel, never a second menu
    await expect(page.getByRole("navigation", { name: "Menu" }), route).toHaveCount(1);
    await expect(page.locator("aside:not([data-rail]):not([data-block=DetailPanel])"), `${route}: no other side box`).toHaveCount(0);
  }
});

test("3 and 4. BrandMark: the right file for the ground and the room, as given, unfiltered, with its clear space and its name", async ({ browser }) => {
  for (const [width, scheme] of [[1440, "light"], [1440, "dark"], [400, "light"], [400, "dark"]] as const) {
    const context = await signedInAs(browser, "coordinator", { width, height: 900 }, scheme);
    const page = await context.newPage();
    await page.goto("/today");
    expect(await brandRules(page, scheme, width, `${scheme} ${width}`)).toEqual([]);
    const img = page.locator("picture[data-brand-mark] img");
    // the logo is bigger than it was (40 px) on both the lockup and the phone's mark, and keeps its clear space (brandRules above)
    expect((await img.boundingBox())!.height).toBeCloseTo(BAR_LOGO_PX, 0);
    await expect(page.getByRole("link", { name: "Cornerstone Gurukul", exact: true })).toHaveAttribute("href", "/today");
    await context.close();
  }
});

async function walk(page: Page) {
  await page.goto("/today");
  await (await menu(page)).getByRole("link", { name: /^Today/ }).click();
}

test("6. the trail is two levels (the section, then the thing); an Activity opened from Today lights My day, opened cold it lights School", async ({ page }) => {
  await page.goto("/children/reports");
  const trail = page.locator("[data-trail]");
  await expect(trail.getByRole("listitem")).toHaveCount(2);
  await expect(trail.getByRole("link")).toHaveText("Children");
  await expect(trail.locator("[aria-current=page]")).toHaveText(await page.locator("h1").innerText());
  await trail.getByRole("link", { name: "Children" }).click();
  await expect(page.locator("h1")).toHaveText("Children");
  // opened cold: the route's own section
  await page.goto("/setup/activities/NO-SUCH");
  await expect(litSection(page)).toHaveText("Curriculum");
  // opened from Today: Today stays lit
  await walk(page);
  await page.evaluate(() => {
    const a = Object.assign(document.createElement("a"), { href: "/setup/activities/NO-SUCH", textContent: "an activity" });
    document.querySelector("main")!.append(a);
  });
  await page.getByRole("link", { name: "an activity" }).click();
  await page.waitForURL(/activities/);
  await expect(litSection(page)).toHaveText("Today");
});

test("8a. the address check looks at page and data requests only: a page request carrying the term fails it, a static file name does not", () => {
  const page = { url: "http://localhost:3100/children?q=13", type: "document" };
  const data = { url: "http://localhost:3100/today?_rsc=1&q=13", type: "fetch" };
  const asset = { url: "http://localhost:3100/_next/static/chunks/ci13tyxr.js", type: "script" };
  expect(addressToLookIn(page)).toContain("13");
  expect(addressToLookIn(data)).toContain("13");
  expect(addressToLookIn(asset)).not.toContain("13");
  expect(addressToLookIn({ url: "http://localhost:3100/growth/0a13b2c4-1313-4313-8313-131313131313", type: "document" })).not.toContain("13");
});

test("8. search is a typeahead: an educator's Sr. No. and fake name find their own class only, five at most, the term only in a POST body", async ({ browser, playwright }) => {
  const person = await (await signedInAs(browser, "educator", { width: 1440, height: 900 })).newPage();
  const seen: Seen[] = [];
  const logs: string[] = [];
  person.on("request", (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData(), type: r.resourceType() }));
  person.on("console", (m) => logs.push(m.text()));
  await person.goto("/today");
  const box = person.locator("[data-bar]").first().getByRole("combobox");
  const options = person.getByRole("listbox", { name: "Found" }).getByRole("option");
  const mine = Object.keys(rows.children)[0];
  const first = mine.split(" ")[0];
  await box.fill("1");
  await expect(options.first()).toContainText(first);
  await expect(options.first()).toContainText("Sr. No. 1");
  await box.fill("13"); // Sr. No. 13 exists only in a class the educator does not hold
  await expect(person.getByRole("status").filter({ hasText: "Nothing found" })).toBeVisible();
  await expect(person.getByRole("listbox", { name: "Found" })).toHaveCount(0);
  const outside = rows.otherNames[0].split(" ")[0];
  await box.fill(outside);
  await expect(person.getByRole("status").filter({ hasText: "Nothing found" })).toBeVisible();
  await box.fill(first);
  await expect(options).toHaveCount(1);
  await box.fill("a");
  await expect.poll(async () => await options.count()).toBeGreaterThan(1);
  expect(await options.count()).toBeLessThanOrEqual(5);
  await box.fill(first);
  await options.first().click();
  await expect(person).toHaveURL(new RegExp(`/growth/${rows.children[mine]}$`));
  // the typed term is in no address, no log line, no other request
  for (const term of ["1", "13", outside, first]) {
    for (const r of seen) {
      if (term.length < 2) continue;
      // only an address that can carry what was typed is looked at (a page, a fetch, an XHR); a hashed build file name is not one
      expect(addressToLookIn(r), `address of ${r.method} ${r.type} request`).not.toContain(term);
      if (r.body?.includes(term)) expect(`${r.method} ${new URL(r.url).pathname}`).toBe("POST /api/search");
    }
    expect(logs.join("\n")).not.toContain(term.length > 1 ? term : "\u0000");
  }
  expect(seen.some((r) => r.method === "POST" && new URL(r.url).pathname === "/api/search" && r.body?.includes(first))).toBe(true);
  const coordinator = await (await signedInAs(browser, "coordinator", { width: 1440, height: 900 })).newPage();
  await coordinator.goto("/today");
  await coordinator.locator("[data-bar]").first().getByRole("combobox").fill(outside);
  await expect(coordinator.getByRole("listbox", { name: "Found" }).getByRole("option").first()).toContainText(outside);
  // signed out: refused
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  expect((await anon.post("/api/search", { data: { q: first } })).status()).toBe(401);
});

test("9. a screen that is not built is not drawn: isBuilt reads merged_slices, and every page of the menu opens a page that exists", async ({ page }) => {
  const built = readFileSync(path.join(WEB, "design-system/built.json"), "utf8");
  const screens = JSON.parse(readFileSync(path.join(WEB, "../../docs/frontend/screens.json"), "utf8"));
  const merged: string[] = screens.merged_slices;
  const live = new Set(screens.slices.filter((s: { id: string }) => merged.includes(s.id)).flatMap((s: { screens: string[] }) => s.screens));
  for (const s of screens.screens) expect(JSON.parse(built).screens[s.id].built, s.id).toBe(live.has(s.id));
  expect(readFileSync(path.join(WEB, "lib/built.ts"), "utf8")).toContain("export const isBuilt");
  await page.goto("/today");
  // no line of the menu points at a screen that is not built: each opens a page that exists today
  for (const door of await (await menu(page)).getByRole("link").all()) {
    const href = (await door.getAttribute("href"))!;
    expect((await page.request.get(href)).status(), href).toBeLessThan(400);
  }
});

test("13. the bare frame: Sign in shows the logo and the form, no bar, no rail", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/login");
  await expect(page.locator("[data-frame=bare]")).toHaveCount(1);
  await expect(page.locator("[data-bar], [data-rail], nav[data-trail]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await brandRules(page, "light", 1280, "sign in")).toEqual([]);
  await context.close();
  expect(FAKE_CHILDREN.length).toBeGreaterThan(18);
});
