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
  for (const route of ["/today", "/papers", "/growth", "/educator", "/educator/week", "/children", "/library", "/school", "/curriculum/browse", "/guide"]) {
    await page.goto(route);
    await expect(page.locator("[data-frame] [data-bar]").first(), route).toBeVisible();
    await expect(page.getByRole("main"), route).toHaveCount(1);
    await expect(page.locator("aside:not([data-rail])"), `${route}: no side menu`).toHaveCount(0);
  }
});

test("2. at 1440 the four doors are the bar's own; at 400 they are a bottom tab bar of 44 px or more with the chosen door in clay", async ({ browser }) => {
  const wide = await (await signedInAs(browser, "coordinator", { width: 1440, height: 900 })).newPage();
  await wide.goto("/growth");
  const top = wide.locator("[data-bar]").first().getByRole("navigation", { name: "Sections" });
  await expect(top).toBeVisible();
  expect((await top.getByRole("link").allInnerTexts()).map((t) => t.replace(/\s*\d[\d,]*$/, "").trim())).toEqual(["Today", "Timetable", "Children", "Setup"]);
  await expect(top.locator("[aria-current=page]")).toHaveText(/^Children/);
  expect((await wide.locator("[data-bar]").first().locator("div").first().boundingBox())?.height).toBe(64);

  const phone = await (await signedInAs(browser, "coordinator", { width: 400, height: 900 })).newPage();
  await phone.goto("/growth");
  const tabs = phone.locator("nav[data-bar=doors]");
  await expect(tabs).toBeVisible();
  const links = tabs.getByRole("link");
  await expect(links).toHaveCount(4);
  for (const l of await links.all()) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const lit = tabs.locator("[aria-current=page]");
  await expect(lit).toHaveText(/Children/);
  const [icon, word] = await lit.evaluate((a) => {
    const [i, w] = [a.children[0] as HTMLElement, a.children[1] as HTMLElement];
    return [getComputedStyle(i).color, getComputedStyle(w).color];
  });
  const clay = await phone.evaluate(() => {
    const e = document.createElement("i");
    e.style.color = "var(--brand-clay)";
    document.body.append(e);
    const c = getComputedStyle(e).color;
    e.remove();
    return c;
  });
  const ink = await phone.evaluate(() => {
    const e = document.createElement("i");
    e.style.color = "var(--ink)";
    document.body.append(e);
    const c = getComputedStyle(e).color;
    e.remove();
    return c;
  });
  expect(icon).toBe(clay);
  expect(word).toBe(ink);
  // the top bar keeps the mark, the search and the person
  const bar = phone.locator("[data-bar]").first();
  await expect(bar.locator("picture[data-brand-mark] img")).toBeVisible();
  await expect(bar.getByRole("combobox")).toBeVisible();
  await expect(bar.getByRole("button", { name: /account/ })).toBeVisible();
  await expect(bar.getByRole("navigation", { name: "Sections" })).toBeHidden();
});

test("3 and 4. BrandMark: the right file for the ground and the room, as given, unfiltered, with its clear space and its name", async ({ browser }) => {
  for (const [width, scheme] of [[1440, "light"], [1440, "dark"], [400, "light"], [400, "dark"]] as const) {
    const context = await signedInAs(browser, "coordinator", { width, height: 900 }, scheme);
    const page = await context.newPage();
    await page.goto("/today");
    expect(await brandRules(page, scheme, width, `${scheme} ${width}`)).toEqual([]);
    const img = page.locator("picture[data-brand-mark] img");
    if (width === 1440) expect((await img.boundingBox())!.height).toBeCloseTo(40, 0);
    await expect(page.getByRole("link", { name: "Cornerstone Gurukul", exact: true })).toHaveAttribute("href", "/today");
    await context.close();
  }
});

async function walk(page: Page) {
  await page.goto("/today");
  await page.locator("[data-bar]").first().getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^Today/ }).click();
}

test("6. the trail is two levels (the door, then the thing); an Activity opened from Today lights Today, opened cold it lights Setup", async ({ page }) => {
  await page.goto("/papers");
  const trail = page.locator("[data-trail]");
  await expect(trail.getByRole("listitem")).toHaveCount(2);
  await expect(trail.getByRole("link")).toHaveText("Children");
  await expect(trail.locator("[aria-current=page]")).toHaveText("Assessments");
  await trail.getByRole("link", { name: "Children" }).click();
  await expect(page.locator("h1")).toHaveText("Children");
  // opened cold: the route's own door
  await page.goto("/educator/activity/NO-SUCH");
  await expect(page.locator("[data-bar] [data-door][aria-current=page]").first()).toHaveText(/^Setup/);
  // opened from Today: Today stays lit
  await walk(page);
  await page.evaluate(() => {
    const a = Object.assign(document.createElement("a"), { href: "/educator/activity/NO-SUCH", textContent: "an activity" });
    document.querySelector("main")!.append(a);
  });
  await page.getByRole("link", { name: "an activity" }).click();
  await page.waitForURL(/activity/);
  await expect(page.locator("[data-bar] [data-door][aria-current=page]").first()).toHaveText(/^Today/);
});

test("8. search is a typeahead: an educator's Sr. No. and fake name find their own class only, five at most, the term only in a POST body", async ({ browser, playwright }) => {
  const person = await (await signedInAs(browser, "educator", { width: 1440, height: 900 })).newPage();
  const seen: { url: string; method: string; body: string | null }[] = [];
  const logs: string[] = [];
  person.on("request", (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() }));
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
  await expect(person.getByRole("status")).toContainText("Nothing found");
  await expect(person.getByRole("listbox", { name: "Found" })).toHaveCount(0);
  const outside = rows.otherNames[0].split(" ")[0];
  await box.fill(outside);
  await expect(person.getByRole("status")).toContainText("Nothing found");
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
      expect(r.url, `address of ${r.method} request`).not.toContain(term);
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

test("9. a screen that is not built is not drawn: isBuilt reads merged_slices, and the doors fall back to their first page", async ({ page }) => {
  const built = readFileSync(path.join(WEB, "design-system/built.json"), "utf8");
  const screens = JSON.parse(readFileSync(path.join(WEB, "../../docs/frontend/screens.json"), "utf8"));
  const merged: string[] = screens.merged_slices;
  const live = new Set(screens.slices.filter((s: { id: string }) => merged.includes(s.id)).flatMap((s: { screens: string[] }) => s.screens));
  for (const s of screens.screens) expect(JSON.parse(built).screens[s.id].built, s.id).toBe(live.has(s.id));
  expect(readFileSync(path.join(WEB, "lib/built.ts"), "utf8")).toContain("export const isBuilt");
  await page.goto("/today");
  // no door points at a screen that is not built: each opens a page that exists today
  for (const door of await page.locator("[data-bar]").first().locator("[data-door]").all()) {
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
