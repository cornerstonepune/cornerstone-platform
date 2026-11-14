/**
 * UI-2 — the blocks (specs/UI-2/spec.md). One test per "Done when" line. The staff-only gallery /setup/blocks shows every
 * block of docs/frontend/screens.json on sample data; charts are rendered by tests/render-blocks.mjs on known data.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { aPerson, forgetPerson } from "./rows";

const WEB = path.resolve(__dirname, "..");
const read = (f: string) => readFileSync(path.join(WEB, f), "utf8");
const SCREENS = JSON.parse(readFileSync(path.resolve(WEB, "../../docs/frontend/screens.json"), "utf8")) as { blocks: Record<string, string> };
const TOKENS = JSON.parse(read("design-system/tokens.json")) as { color: { tokens: { name: string }[] }; radius: { tokens: { name: string }[] }; shadow: { tokens: { name: string }[] } };
const BLOCKS = Object.keys(SCREENS.blocks);
const kebab = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const stateKeys = () => [...read("components/status-chip.tsx").matchAll(/^  (\w+): \{ tone:/gm)].map((m) => m[1]);

const render = (file: string, name: string, props: unknown) =>
  execFileSync(process.execPath, [path.join(__dirname, "render-blocks.mjs"), file, name, JSON.stringify(props)], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
const texts = (svgOrHtml: string) => [...svgOrHtml.matchAll(/>([^<>]+)</g)].map((m) => m[1].trim()).filter(Boolean);
const attr = (markup: string, a: string) => [...markup.matchAll(new RegExp(`${a}="([^"]*)"`, "g"))].map((m) => m[1]);

async function gallery(page: Page, query = "", scheme: "light" | "dark" = "light") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`/setup/blocks${query}`);
  if (scheme === "dark") await page.evaluate(() => document.documentElement.removeAttribute("data-scheme"));
  await page.evaluate(() => document.fonts.ready);
}
const openAll = (page: Page) => page.evaluate(() => document.querySelectorAll("details[data-fold]").forEach((d) => ((d as HTMLDetailsElement).open = true)));
/** A token's colour as the browser resolves it (the same one the block must show). */
const tokenColour = (page: Page, token: string, prop: "color" | "backgroundColor" = "color") =>
  page.evaluate(([t, p]) => {
    const e = document.createElement("i");
    e.style.cssText = `${p === "color" ? "color" : "background-color"}: var(--${t})`;
    document.body.append(e);
    const v = getComputedStyle(e)[p as "color"];
    e.remove();
    return v;
  }, [token, prop] as const);

test("1. every block but AppFrame has components/<kebab-name>.tsx with its data-block root", () => {
  for (const name of BLOCKS.filter((b) => b !== "AppFrame")) {
    const file = `components/${kebab(name)}.tsx`;
    expect(existsSync(path.join(WEB, file)), file).toBe(true);
    expect(read(file), file).toContain(`data-block="${name}"`);
  }
});

test("2. the gallery renders every block, and each block's behaviours work", async ({ page }) => {
  await gallery(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The blocks");
  // fold opens and closes
  const fold = page.locator('[data-fold="Details"]');
  await fold.locator("> summary").click();
  await expect(fold).toHaveAttribute("open", "");
  await expect(fold.locator('[data-sample="Details"]')).toBeVisible();
  await fold.locator("> summary").click();
  await expect(fold.locator('[data-sample="Details"]')).toBeHidden();
  // the Details block itself: the sample fold opens and its text shows
  await fold.locator("> summary").click();
  const inner = fold.locator('[data-sample="Details"] details');
  await inner.locator("summary").click();
  await expect(inner).toContainText("bundles of ten");
  // filter writes the address, × clears one, Clear clears all, a reload keeps them
  await gallery(page, "?open=FilterBar");
  const bar = page.locator('[data-fold="FilterBar"]');
  // the sample's first dropdown is Class (the row shows three, the rest behind More filters)
  const klass = bar.locator('select[name="class"]');
  await klass.selectOption("K2 Red");
  await expect(page).toHaveURL(/class=K2\+Red/);
  await page.reload();
  await expect(page).toHaveURL(/class=K2\+Red/);
  await expect(klass).toHaveValue("K2 Red");
  await bar.getByRole("link", { name: /Remove filter/ }).click();
  await expect(page).not.toHaveURL(/class=/);
  await klass.selectOption("K2 Blue");
  await bar.getByRole("link", { name: "Clear" }).click();
  await expect(page).not.toHaveURL(/class=/);
  // a grid cell acts: a tap changes the mark; a child's square is a link
  await gallery(page, "?open=ClassGrid");
  const marks = page.locator('[data-sample="ClassGrid"] ol').first().locator("button");
  const before = await marks.first().getAttribute("data-state");
  await marks.first().click();
  expect(await marks.first().getAttribute("data-state")).not.toBe(before);
  await expect(page.locator('[data-sample="ClassGrid"] ol').nth(1).locator("a").first()).toHaveAttribute("href", /\/setup\/blocks/);
  // stepper: every step has a state, an icon and words; the four states are all shown
  await gallery(page, "?open=Stepper");
  const steps = page.locator('[data-sample="Stepper"] li');
  const states = new Set<string>();
  for (let i = 0; i < (await steps.count()); i++) {
    states.add((await steps.nth(i).getAttribute("data-state")) ?? "");
    await expect(steps.nth(i).locator("svg")).toHaveCount(1);
    expect((await steps.nth(i).innerText()).trim().length).toBeGreaterThan(2);
  }
  expect([...states].sort()).toEqual(["late", "ok", "quiet", "wait"]);
  // a chip is an icon and a word
  await gallery(page, "?open=StatusChip");
  const chips = page.locator('[data-sample="StatusChip"] [data-block="StatusChip"]');
  expect(await chips.count()).toBeGreaterThan(3);
  for (let i = 0; i < (await chips.count()); i++) {
    await expect(chips.nth(i).locator("svg")).toHaveCount(1);
    expect((await chips.nth(i).innerText()).trim().length).toBeGreaterThan(2);
  }
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [1440, 400]) {
    test(`2. every block, ${scheme}, ${width} px, is its committed screenshot`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gallery(page, "", scheme);
      await openAll(page);
      for (const name of BLOCKS) {
        const sample = page.locator(`[data-sample="${name}"]`);
        await expect(sample, `${name} has a sample`).toBeVisible();
        // soft: every block that differs is reported in the one run (and its picture kept), not only the first; the test still fails
        await expect.soft(sample).toHaveScreenshot(`${name}-${scheme}-${width}.png`, { maxDiffPixelRatio: 0.01 });
      }
    });
  }

test("3. StatusChip draws every state in STATES with an icon and a word; a state without an icon does not compile", async ({ page }) => {
  const keys = stateKeys();
  expect(keys.length).toBeGreaterThan(40);
  await gallery(page);
  const chips = page.locator('[data-legend="states"] [data-block="StatusChip"]');
  expect(await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))).toEqual(keys);
  for (let i = 0; i < keys.length; i++) {
    await expect(chips.nth(i).locator("svg[data-icon]")).toHaveCount(1);
    expect((await chips.nth(i).innerText()).trim().length).toBeGreaterThan(1);
  }
  // the contract file holds the "does not compile" half; it is the type check that runs it
  expect(read("tests/u71-chip-contract.ts")).toContain("@ts-expect-error");
  expect(read("components/status-chip.tsx")).toMatch(/icon: IconName/);
});

test("4. ClassGrid replaces voice/board.tsx's own grid", () => {
  const board = read("app/(app)/voice/board.tsx");
  expect(board).toContain('from "@/components/class-grid"');
  expect(board).not.toMatch(/function Cell\b/);
  expect(read("components/class-grid.tsx")).toContain("data-grid");
});

test("5. charts: every label is a value or a date from the data; to scale; tokens only; empty words, never an empty axis", () => {
  // StackBar
  const parts = [{ state: "secure", n: 10 }, { state: "practising", n: 7 }, { state: "emerging", n: 4 }, { state: "notSeenYet", n: 3 }];
  const stack = render("stack-bar", "StackBar", { parts });
  expect(new Set(texts(stack))).toEqual(new Set(["10 secure", "7 practising", "4 emerging", "3 not seen yet"]));
  expect(attr(stack, "--n").length).toBe(0);
  expect([...stack.matchAll(/--n:(\d+)/g)].map((m) => Number(m[1]))).toEqual([10, 7, 4, 3]);
  // LevelBars: a bar is its share of the children
  const levels = [{ level: 0, n: 3 }, { level: 1, n: 10 }, { level: 2, n: 8 }, { level: 3, n: 3 }];
  const lb = render("level-bars", "LevelBars", { levels });
  expect(texts(lb)).toEqual(["Level 0", "3", "Level 1", "10", "Level 2", "8", "Level 3", "3"]);
  const widths = [...lb.matchAll(/--n:([\d.]+)/g)].map((m) => Number(m[1]));
  levels.forEach((l, i) => expect(widths[i]).toBeCloseTo((l.n / 24) * 100, 1));
  // Spark: the line is the values, scaled between the least and the greatest
  const values = [2, 3, 5, 6, 9, 11];
  const spark = render("spark", "Spark", { values, label: "Secure" });
  expect(texts(spark)).toEqual(["11 now"]);
  const pts = attr(spark, "points")[0].split(" ").map((p) => p.split(",").map(Number));
  values.forEach((v, i) => {
    expect(pts[i][0]).toBeCloseTo(10 + (i / 5) * 280, 1);
    expect(pts[i][1]).toBeCloseTo(54 - ((v - 2) / 9) * 36, 1);
  });
  // Trend: x by date, y by level; the first and last labelled with their date and level
  const sittings = [{ date: "2026-08-04", level: 0 }, { date: "2026-09-08", level: 1 }, { date: "2026-10-13", level: 1 }, { date: "2026-11-18", level: 2 }];
  const trend = render("trend", "Trend", { sittings });
  expect(texts(trend)).toEqual(["4-Aug · level 0", "18-Nov · level 2"]);
  const tp = attr(trend, "points")[0].split(" ").map((p) => p.split(",").map(Number));
  const t = sittings.map((s) => Date.parse(`${s.date}T00:00:00Z`));
  sittings.forEach((s, i) => {
    expect(tp[i][0]).toBeCloseTo(40 + ((t[i] - t[0]) / (t[3] - t[0])) * 540, 1);
    expect(tp[i][1]).toBeCloseTo(100 - s.level * 30, 1);
  });
  // HeatGrid
  const heat = render("heat-grid", "HeatGrid", { days: ["Mon", "Tue"], rows: [{ label: "K2 Red", cells: ["done", "moved"] }, { label: "K2 Blue", cells: ["notDone", "holiday"] }] });
  expect(texts(heat)).toEqual(["Mon", "Tue", "K2 Red", "done", "moved", "K2 Blue", "not done", "holiday"]);
  // colours only from tokens: no colour literal in a chart's markup or source
  for (const m of [stack, lb, spark, trend, heat]) expect(m).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|(fill|stroke)="(?!currentColor|none)/i);
  for (const f of ["stack-bar", "level-bars", "spark", "trend", "heat-grid"]) expect(read(`components/${f}.tsx`), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
  // no data: its words, no axis, no line, no bars
  const empties: [string, string, unknown, string][] = [
    ["stack-bar", "StackBar", { parts: [] }, "No children counted yet"],
    ["level-bars", "LevelBars", { levels: [] }, "No levels recorded yet"],
    ["spark", "Spark", { values: [], label: "Secure" }, "Nothing seen yet"],
    ["trend", "Trend", { sittings: [] }, "No sittings yet"],
    ["heat-grid", "HeatGrid", { days: [], rows: [] }, "No days to show yet"],
  ];
  for (const [f, n, props, words] of empties) {
    const m = render(f, n, props);
    expect(m, f).toContain(words);
    expect(m, f).toContain("data-empty");
    expect(m, f).not.toMatch(/<svg|<polyline|<line|<text|class="b-lbar"|class="b-sbar"/);
  }
});

test("6. Details is a native <details>, and no main action sits inside a closed one", async ({ page }) => {
  expect(read("components/details.tsx")).toContain("<details");
  expect(read("components/details.tsx")).toContain("<summary>");
  await gallery(page);
  expect(await page.locator("details:not([open]) [data-main]").count()).toBe(0);
  expect(await page.locator("[data-main]").count()).toBe(1); // the page's one main action, outside every fold
});

test("7. no file outside lib/icons.tsx imports lucide-react", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (["node_modules", ".next", "test-results", ".git"].includes(e) || e.startsWith(".next")) continue;
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|mjs|js|jsx)$/.test(e) && /from\s+["']lucide-react|require\(["']lucide-react|import\(["']lucide-react/.test(readFileSync(p, "utf8"))) offenders.push(path.relative(WEB, p));
    }
  };
  walk(WEB);
  expect(offenders).toEqual(["lib/icons.tsx"]);
});

test("8. KindTile draws each of the seven kinds, icon and colour; rail links, card headers and timeline entries start with one", async ({ page }) => {
  await gallery(page);
  await openAll(page);
  for (const kind of ["period", "child", "activity", "objective", "skill", "assessment", "note"]) {
    const tile = page.locator(`[data-sample="KindTile"] [data-block="KindTile"][data-kind="${kind}"]`).first();
    await expect(tile.locator(`svg[data-icon="${kind}"]`)).toHaveCount(1);
    expect(await tile.evaluate((e) => getComputedStyle(e).color)).toBe(await tokenColour(page, `kind-${kind}`));
    expect(await tile.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(await tokenColour(page, `kind-${kind}-bg`, "backgroundColor"));
  }
  for (const sel of ["[data-rail-link]", ".b-card-h", ".b-tli"]) {
    const n = await page.locator(sel).count();
    expect(n, sel).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) expect(await page.locator(sel).nth(i).evaluate((e) => e.firstElementChild?.getAttribute("data-block")), `${sel} ${i}`).toBe("KindTile");
  }
});

test("9. a chip on a tinted cell sits on the panel colour with a 1 px ring in its state colour", async ({ page }) => {
  for (const scheme of ["light", "dark"] as const) {
    await gallery(page, "?open=FortnightGrid", scheme);
    const panel = await tokenColour(page, "panel", "backgroundColor");
    for (const [subject, status, token] of [["arts", "moved", "state-wait"], ["language", "toConfirm", "state-wait"]] as const) {
      const cell = page.locator(`[data-sample="FortnightGrid"] .b-cell[data-subject="${subject}"]`).filter({ has: page.locator(`[data-status="${status}"]`) });
      const chip = cell.locator(`[data-status="${status}"]`);
      const style = await chip.evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, w: s.borderTopWidth, c: s.borderTopColor }; });
      expect(style.bg, `${subject} ${scheme}`).toBe(panel);
      expect(style.w).toBe("1px");
      expect(style.c).toBe(await tokenColour(page, token));
      expect(await cell.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(panel);
    }
    await expect(page.locator('[data-sample="FortnightGrid"]')).toHaveScreenshot(`tinted-chips-${scheme}.png`, { maxDiffPixelRatio: 0.01 });
  }
});

test("10. the gallery's controls are exactly its folds and its one main action", async ({ page }) => {
  await gallery(page);
  // what a person can reach: a control not inside a closed fold, or the closed fold's own summary
  const reach = await page.locator(".b-gallery :is(a, button, input, select, summary)").evaluateAll((els) =>
    els.filter((e) => { const d = e.closest("details:not([open])"); return !d || (e.tagName === "SUMMARY" && e.parentElement === d && !d.parentElement?.closest("details:not([open])")); }).map((e) => e.tagName));
  expect(reach.length).toBe(BLOCKS.length); // the legend holds none; every fold is closed
  expect(new Set(reach)).toEqual(new Set(["SUMMARY"]));
  await expect(page.locator("[data-main]")).toHaveText("Open the first block");
  await page.locator("[data-main]").click();
  await expect(page.locator(`[data-fold="${BLOCKS[0]}"]`)).toHaveAttribute("open", "");
});

test("11. one fold per block, and each has a sample", async ({ page }) => {
  await gallery(page);
  await openAll(page);
  const folds = await page.locator("details[data-fold]").evaluateAll((els) => els.map((e) => e.getAttribute("data-fold")));
  expect(folds.filter((f) => BLOCKS.includes(f ?? ""))).toEqual(BLOCKS);
  for (const name of BLOCKS) {
    const sample = page.locator(`[data-sample="${name}"]`);
    await expect(sample.locator("[data-no-sample]"), `${name} has no sample`).toHaveCount(0);
    expect(await sample.locator(`[data-block="${name}"]`).count(), name).toBeGreaterThan(0);
  }
});

// ---- 12: absent for an educator, linked only from Setup's details ----
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u71-educator@cornerstone.test", name: "U71 Educator", role: "educator" };
const PASSWORD = "u71-a-long-test-password";
test.afterAll(async () => {
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});
async function asEducator(browser: Browser): Promise<Page> {
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

test("12. the page is absent for an educator and linked only from Setup's details", async ({ page, browser }) => {
  await page.goto("/setup/curriculum/skills");
  expect(await page.locator('a[href="/setup/blocks"]').count()).toBe(0);
  await page.goto("/setup/curriculum/skills?details=1");
  await expect(page.locator('a[href="/setup/blocks"]')).toHaveCount(1);
  // no other page of the site names it
  const named: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e) && readFileSync(p, "utf8").includes('"/setup/blocks')) named.push(path.relative(WEB, p));
    }
  };
  for (const d of ["app", "components", "lib"]) walk(path.join(WEB, d));
  expect(named.filter((f) => !f.startsWith("app/(app)/setup/blocks") && !f.startsWith("components/")).sort()).toEqual(["app/(app)/setup/curriculum/skills/page.tsx", "app/(app)/setup/page.tsx"]); // the skill list moved from / (Design PR 1)
  const edu = await asEducator(browser);
  await edu.goto("/setup/blocks"); // the page streams, so it answers 200 with Next's own "not found" in place of the page
  await expect(edu.getByText("This page could not be found")).toBeVisible();
  await expect(edu.getByRole("heading", { name: "The blocks" })).toHaveCount(0);
  expect(await edu.locator("[data-section], [data-fold]").count()).toBe(0);
  await edu.goto("/setup/curriculum/skills?details=1");
  expect(await edu.locator('a[href="/setup/blocks"]').count()).toBe(0);
  await edu.context().close();
});

test("13. the legend is first and is read from STATES, the action list and tokens.json", async ({ page }) => {
  await gallery(page);
  await expect(page.locator(".b-gallery > section").first()).toHaveAttribute("data-section", "legend");
  const kinds = TOKENS.color.tokens.map((t) => t.name).filter((n) => /^kind-/.test(n) && !n.endsWith("-bg")).map((n) => n.slice(5));
  const subjects = TOKENS.color.tokens.map((t) => t.name).filter((n) => /^subject-/.test(n) && !/-(bg|ink)$/.test(n)).map((n) => n.slice(8));
  const actions = [...read("lib/icons.tsx").match(/export const ACTIONS = \[([^\]]*)\]/)![1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  expect(await page.locator("[data-legend-kind]").evaluateAll((e) => e.map((x) => x.getAttribute("data-legend-kind")))).toEqual(kinds);
  expect(await page.locator("[data-legend-subject]").evaluateAll((e) => e.map((x) => x.getAttribute("data-legend-subject")))).toEqual(subjects);
  expect(await page.locator("[data-action]").evaluateAll((e) => e.map((x) => x.getAttribute("data-action")))).toEqual(actions);
  expect(await page.locator("[data-legend-shape]").count()).toBe(TOKENS.radius.tokens.length + TOKENS.shadow.tokens.length);
  for (const k of kinds) await expect(page.locator(`[data-legend-kind="${k}"] [data-block="KindTile"] svg`)).toHaveCount(1);
  for (const a of actions) await expect(page.locator(`[data-action="${a}"] svg`)).toHaveCount(1);
  expect(await page.locator('[data-legend="states"] [data-block="StatusChip"]').count()).toBe(stateKeys().length);
});

test("14. the legend shows the four logo files, where each is used, and the rules", async ({ page }) => {
  await gallery(page);
  const logos = page.locator("[data-logo]");
  expect(await logos.evaluateAll((e) => e.map((x) => x.getAttribute("data-logo")))).toEqual(["lockup-colour", "lockup-for-dark-backgrounds", "mark", "mark-on-white-tile"]);
  for (let i = 0; i < 4; i++) {
    const img = logos.nth(i).locator("img");
    expect(await img.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect((await logos.nth(i).locator("span").innerText()).length).toBeGreaterThan(10);
  }
  const rules = (await page.locator("[data-logo-rules]").innerText()).toLowerCase();
  for (const w of ["recolour", "white tile", "quarter", "stretch", "rotate", "shadow"]) expect(rules).toContain(w);
});

test("axe: no serious or critical violation on the gallery, light and dark, at both widths", async ({ page }) => {
  const { AxeBuilder } = await import("@axe-core/playwright");
  for (const scheme of ["light", "dark"] as const)
    for (const width of [1440, 400]) {
      await page.setViewportSize({ width, height: 900 });
      await gallery(page, "", scheme);
      await openAll(page);
      const bad = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
      expect(bad.map((v) => `${scheme} ${width}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
    }
});
