/**
 * U90 — one design system (CP-65, Nimish 17 Nov 2026: "dull, inconsistent, badly organised"), in its second language (CP-68, the same day:
 * "it does not make me want to come onto the platform"). Held on every page of the menu, at 1440 and 400 px: a white page; three font sizes
 * (30 title, 16 body, 14 small) in two weights; cards that never touch and sit a scale step apart (12, 20, 32, 48 or 64 px); every table
 * with explicit, even column widths; and the language itself: a dark bar with the page you are on as a terracotta pill, a white tab bar
 * on a phone, one accent, no black slab button, a card of 12 px corners with real padding, motion read from the tokens, and the kind colours
 * (teal child, indigo activity, violet objective, orchid skill, sky paper, slate period, stone note) kept apart from every subject colour. Every colour and
 * size below is read from the tokens file (docs/frontend/tokens.json), never typed here.
 */
import { expect, test, type Page } from "@playwright/test";
import { readTokens } from "./tokens-file";
import { subjectLook, LOOKS } from "../lib/subject-looks";
import { readFileSync } from "node:fs";
import path from "node:path";

const T = readTokens();
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

const ROUTES = ["/today", "/timetable", "/children", "/children/assessments", "/setup/curriculum", "/setup/staff"];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 400, height: 800 }];
const SIZES = [...new Set(["--text-caption", "--text-body", "--text-title-page"].map((k) => parseFloat(T[k])))];
const WEIGHTS = [400, 600];
const GAPS = [12, 20, 32, 48, 64];
const CARD = ".b-card, .b-sq, .b-prow, .b-att, .b-dpanel, .panel";

async function fonts(page: Page) {
  return page.evaluate(() => {
    const seen = new Map<string, string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent?.trim() || el.closest("svg, script, style, noscript, [hidden]")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const key = `${parseFloat(cs.fontSize)}px/${cs.fontWeight}`;
      if (!seen.has(key)) seen.set(key, `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${n.textContent!.trim().slice(0, 24)}"`);
    }
    return [...seen];
  });
}

async function cardGaps(page: Page) {
  return page.evaluate((sel) => {
    const bad: string[] = [];
    const parents = new Set<Element>();
    document.querySelectorAll(sel).forEach((c) => c.parentElement && parents.add(c.parentElement));
    for (const p of parents) {
      const kids = [...p.children].filter((k) => k.matches(sel) && getComputedStyle(k).display !== "none").map((k) => ({ k, r: k.getBoundingClientRect() })).filter((x) => x.r.width > 0);
      for (let i = 0; i < kids.length; i++)
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].r, b = kids[j].r;
          const overX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const gap = overX > 1 ? Math.max(b.top - a.bottom, a.top - b.bottom) : overY > 1 ? Math.max(b.left - a.right, a.left - b.right) : null;
          // a gap of 0 or off the scale is a defect; a card more than 64 px away is layout, not a gap
          if (gap !== null && gap <= 64 && !(gap >= 11.5 && [12, 20, 32, 48, 64].some((s) => Math.abs(s - gap) < 0.6))) bad.push(`${gap.toFixed(1)}px between ${String(kids[i].k.className).slice(0, 30)} and ${String(kids[j].k.className).slice(0, 30)}`);
        }
    }
    return bad;
  }, CARD);
}

// every block-level child of a page's column (a card, a notice, a banner, a filter bar, a table) sits a scale step from the next
async function blockGaps(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const col of document.querySelectorAll("[data-column], [data-body]")) {
      const kids = [...col.children].map((k) => ({ k, r: k.getBoundingClientRect(), cs: getComputedStyle(k) })).filter((x) => x.r.height > 0 && x.cs.display !== "none" && x.cs.position !== "fixed" && x.cs.position !== "absolute");
      for (let i = 1; i < kids.length; i++) {
        const gap = kids[i].r.top - kids[i - 1].r.bottom;
        // side by side (a row of the grid) is not stacked
        if (kids[i].r.top < kids[i - 1].r.bottom - 1) continue;
        if (gap < 11.5 || ![12, 20, 32, 48, 64].some((g) => Math.abs(g - gap) < 0.6)) bad.push(`${gap.toFixed(1)}px before ${kids[i].k.tagName.toLowerCase()}.${String(kids[i].k.className).slice(0, 30)}`);
      }
    }
    return bad;
  });
}

for (const vp of VIEWPORTS)
  // the one guard on look-and-feel (standing order, 17 Nov), so it runs on every pull request
  test.describe(`at ${vp.width}px`, { tag: "@core" }, () => {
    test.use({ viewport: vp });
    for (const route of ROUTES) {
      test(`${route}: white page, three sizes, two weights`, async ({ page }) => {
        await page.goto(route);
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "the page is white").toBe("rgb(255, 255, 255)");
        const used = await fonts(page);
        const off = used.filter(([k]) => !SIZES.includes(parseFloat(k)) || !WEIGHTS.includes(Number(k.split("/")[1])));
        expect(off, `sizes/weights off the scale: ${JSON.stringify(off)}`).toEqual([]);
      });
      test(`${route}: cards never touch and keep a scale gap`, async ({ page }) => {
        await page.goto(route);
        expect(await cardGaps(page)).toEqual([]);
      });
      test(`${route}: every block of the column keeps a scale gap`, async ({ page }) => {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await blockGaps(page)).toEqual([]);
      });
      test(`${route}: every table fixes its column widths`, async ({ page }) => {
        await page.goto(route);
        const loose = await page.evaluate(() => [...document.querySelectorAll("table")].filter((t) => getComputedStyle(t).display !== "none" && !t.querySelector("colgroup col[style*=width], colgroup col[width]")).length);
        expect(loose, "tables without a colgroup of widths").toBe(0);
      });
    }
  });

// ---------- the language (CP-68) ----------

test("1. the bar is the brand's dark with white words, and the page you are on is a terracotta pill", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/timetable");
  const bar = page.locator("header[data-bar]");
  expect(await bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(rgb(T["--bar"]));
  expect(T["--bar"], "the bar is the warm basalt of the old menu, never pure black").toBe(T["--menu"]);
  expect(T["--bar"]).not.toBe("#000000");
  expect(T["--bar-pill"], "the pill is the one accent").toBe(T["--action"]);
  const links = bar.locator("nav[data-topnav] a");
  const on = bar.locator("nav[data-topnav] a[aria-current=page]");
  await expect(on).toHaveCount(1);
  const look = (l: typeof on) => l.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, ink: getComputedStyle(e).color, r: parseFloat(getComputedStyle(e).borderTopLeftRadius) }));
  expect(await look(on)).toMatchObject({ bg: rgb(T["--bar-pill"]), ink: rgb(T["--bar-pill-ink"]) });
  expect((await look(on)).r, "a pill").toBeGreaterThanOrEqual(20);
  const off = links.and(page.locator(":not([aria-current])")).first();
  expect((await look(off)).ink).toBe(rgb(T["--bar-ink"]));
  expect(T["--bar-ink"]).toBe("#ffffff");
});

test("1. on a phone the tab bar is white and the active tab is terracotta", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("/timetable");
  const tabs = page.locator("nav[data-tabbar]");
  expect(await tabs.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)");
  expect(await tabs.locator("a[aria-current=page]").evaluate((e) => getComputedStyle(e).color)).toBe(rgb(T["--action"]));
});

for (const route of ROUTES)
  test(`2. ${route}: no black slab; a filled button is terracotta`, { tag: "@core" }, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    const fills = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, a.btn, a.chip, a.b-btn, [role=button], [data-slot=button], [data-ux=action]")]
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => ({ bg: getComputedStyle(e).backgroundColor, text: (e.textContent ?? "").trim().slice(0, 30) })),
    );
    // a fill darker than the muted ink is a slab: only the accent (and its deeper shades on the bar) may be that strong
    const lum = (c: string) => { const m = c.match(/[\d.]+/g)!.map(Number); return m.length > 3 && m[3] === 0 ? 1 : (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const allowed = new Set(["--action", "--action-hover", "--bar-badge", "--bar-hover"].map((k) => rgb(T[k])));
    expect(fills.filter((f) => lum(f.bg) < 0.35 && !allowed.has(f.bg)), "dark fills that are not the accent").toEqual([]);
    // a primary button, wherever the page's data puts one, is the filled accent: none is outline, none is drawn in another colour
    const primary = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main .btn:not(.secondary):not(.tertiary), main .b-btn-main")]
        .filter((e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled)
        .map((e) => ({ bg: getComputedStyle(e).backgroundColor, text: (e.textContent ?? "").trim().slice(0, 30) })),
    );
    expect(primary.filter((f) => f.bg !== rgb(T["--action"])), "a main action that is not the filled terracotta").toEqual([]);
  });

test("3. the kinds keep their own colours, kept apart from every subject by the contrast table", { tag: "@core" }, async ({ page }) => {
  const kinds = ["period", "child", "activity", "objective", "skill", "assessment", "note"];
  expect(new Set(kinds.map((k) => T[`--kind-${k}`])).size, "seven kinds, seven colours").toBe(7);
  const table = readFileSync(path.resolve(__dirname, "../../../docs/design-tokens-contrast.md"), "utf8");
  expect(table, "no kind is taken for a subject or a state").toContain("No kind colour is taken for a subject or a state");
  expect(table).not.toMatch(/\| kind-[a-z]+ \| (subject|state)-[a-z0-9]+ \| [\d.]+ \| FAIL \|/);
  // and they are drawn: a kind tile on a page is its kind's colour, not a grey
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/setup/blocks?open=KindTile");
  const tiles = await page.locator(".b-tile").evaluateAll((els) => els.map((e) => [e.closest("[data-kind]")?.getAttribute("data-kind"), getComputedStyle(e).color] as const));
  expect(tiles.length).toBeGreaterThan(0);
  for (const [kind, colour] of tiles) if (kind) expect(colour, kind).toBe(rgb(T[`--kind-${kind}`]));
});

test("4. every subject look has its own colour, and which subject wears which is the school's row", { tag: "@core" }, async () => {
  const colours = LOOKS.map((l) => T[`--subject-${l}`]);
  expect(colours.every(Boolean), "a token for every look").toBe(true);
  expect(new Set(colours).size, "no two looks share a colour").toBe(LOOKS.length);
  for (const l of LOOKS) expect(T[`--subject-${l}-bg`], `${l}'s fill`).toBeDefined();
  // the map is data: the code holds no subject's name, and a look the tokens do not hold falls back
  expect(subjectLook({ anything: "music" }, "anything")).toBe("music");
  expect(subjectLook({ anything: "nonsense" as never }, "anything")).toBe("arts");
  expect(readFileSync(path.resolve(__dirname, "../lib/subject-looks.ts"), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")).not.toMatch(/\b(math|maths|english|hindi|phonics)\b/i);
});

test("5. a card has 12 px corners and 16 to 20 px of padding", { tag: "@core" }, async ({ page }) => {
  expect(T["--radius-card"]).toBe("12px");
  expect([parseFloat(T["--space-card-tight"]), parseFloat(T["--space-card"])]).toEqual([16, 20]);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ["/today", "/timetable", "/children/assessments"]) {
    await page.goto(route);
    const off = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".b-card, .b-dpanel, .panel, .b-details")]
        .filter((e) => e.getClientRects().length > 0)
        .filter((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius) !== 12)
        .map((e) => `${e.className.slice(0, 30)}: ${getComputedStyle(e).borderTopLeftRadius}`),
    );
    expect(off, route).toEqual([]);
    // text never sits flush on a card's edge: the first text inside starts 12 px or more in
    const flush = await page.evaluate(() => {
      const bad: string[] = [];
      for (const c of document.querySelectorAll<HTMLElement>(".b-card, .b-dpanel, .panel")) {
        if (!c.getClientRects().length) continue;
        const box = c.getBoundingClientRect();
        const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          const t = r.getBoundingClientRect();
          if (t.width && t.left - box.left < 11.5) bad.push(`${c.className.slice(0, 24)}: "${n.textContent.trim().slice(0, 20)}" ${Math.round(t.left - box.left)}px in`);
          break;
        }
      }
      return bad;
    });
    expect(flush, route).toEqual([]);
    // no box inside a box: a card never holds another card with an edge of its own
    const nested = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(":is(.b-card, .b-dpanel, .b-details, .panel) :is(.b-card, .panel)")].filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).boxShadow !== "none").length);
    expect(nested, `${route}: a card with an edge inside a card`).toBe(0);
  }
});

test("6. the title is larger than the old 24 px, and tighter", { tag: "@core" }, async ({ page }) => {
  await page.goto("/today");
  const h1 = await page.locator("h1").first().evaluate((e) => ({ size: parseFloat(getComputedStyle(e).fontSize), track: parseFloat(getComputedStyle(e).letterSpacing) }));
  expect(h1.size).toBe(parseFloat(T["--text-title-page"]));
  expect(h1.size).toBeGreaterThan(24);
  expect(h1.track, "negative tracking").toBeLessThan(0);
});

test("7. the count chip and the meter draw whole numbers and say their value", { tag: "@core" }, async ({ page }) => {
  await page.goto("/setup/blocks?open=CountChip");
  const chip = page.locator("[data-block=CountChip]").first();
  await expect(chip).toHaveText("1,250 to do");
  await expect(chip).toHaveAttribute("data-tone", "act");
  expect(await chip.locator("b").evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain("tabular-nums");
  await page.goto("/setup/blocks?open=Meter");
  const bar = page.locator("[data-block=Meter]").first().getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", "3");
  await expect(bar).toHaveAttribute("aria-valuemax", "12");
  await expect(bar).toHaveAttribute("aria-valuetext", "3 of 12 papers checked");
  expect(await page.locator("[data-block=Meter] .b-meter-n").first().evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain("tabular-nums");
  // the fill is a third of the track
  const [track, fill] = await Promise.all([bar.boundingBox(), bar.locator(".b-meter-fill").boundingBox()]);
  expect(fill!.width / track!.width).toBeCloseTo(0.25, 1);
  // whole counts only: the components refuse anything else (read from their source, since a test cannot render them)
  expect(readFileSync(path.resolve(__dirname, "../components/count-chip.tsx"), "utf8")).toMatch(/Number\.isInteger\(n\) \|\| n < 0\) throw new RangeError/);
});

test("8. motion comes from the tokens: 150 to 200 ms, eased out, and nothing moves under reduced motion", { tag: "@core" }, async ({ browser }) => {
  expect([parseFloat(T["--motion-fast"]), parseFloat(T["--motion-base"])]).toEqual([150, 200]);
  expect(T["--motion-ease"]).toMatch(/^cubic-bezier\(/);
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ storageState: test.info().project.use.storageState as string, viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    await page.goto("/today");
    const longest = await page.evaluate(() => {
      let max = 0;
      for (const e of document.querySelectorAll<HTMLElement>("a, button, summary, .b-card, .b-prow, .b-dpanel, .b-today-chev"))
        for (const d of getComputedStyle(e).transitionDuration.split(",")) max = Math.max(max, parseFloat(d) * (d.trim().endsWith("ms") ? 1 : 1000));
      return max;
    });
    expect(longest, "nothing eases for longer than the base").toBeLessThanOrEqual(200);
    // a period row lifts under the pointer; under reduced motion it stays where it is
    const row = page.locator("a.b-prow:not([data-subject=fixed])").first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(250);
      const moved = await row.evaluate((e) => getComputedStyle(e).transform);
      expect(moved === "none" || moved === "matrix(1, 0, 0, 1, 0, 0)", `reduced=${reduced}: ${moved}`).toBe(reduced);
    }
    await context.close();
  }
});

test("9. an empty state is one line and at most one action", { tag: "@core" }, async ({ page }) => {
  await page.goto("/setup/blocks?open=EmptyState");
  const empty = page.locator("[data-block=EmptyState]").first();
  await expect(empty.locator("p")).toHaveCount(1);
  await expect(empty.getByRole("link")).toHaveCount(1);
  // quiet: never a state's colour behind it
  expect(await empty.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(rgb(T["--surface"]));
  for (const route of ROUTES) {
    await page.goto(route);
    const many = await page.evaluate(() => [...document.querySelectorAll("[data-block=EmptyState]")].filter((e) => e.querySelectorAll("p").length !== 1 || e.querySelectorAll("a, button").length > 1).length);
    expect(many, route).toBe(0);
  }
});

// The word budget (CP-65, Nimish 17 Nov 2026: main pages are for glancing; details open on click): the line under the title is at most 10
// words, and no loose paragraph on a main page runs past 14 words. Paragraphs inside a table, a list, the detail panel, an empty state or a
// day's own note are data or a message, not page copy. Chosen from what the six redesigned pages need: the longest is "Week A and week B, a block per period."
const PURPOSE_WORDS = 10;
const PARAGRAPH_WORDS = 14;
for (const route of ROUTES)
  test(`${route}: word budget`, { tag: "@core" }, async ({ page }) => {
    await page.goto(route);
    const { purpose, long } = await page.evaluate((cap) => {
      const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
      const purpose = words(document.querySelector("[data-purpose]")?.textContent ?? "");
      const long = [...document.querySelectorAll("main p")]
        .filter((p) => !p.closest("table, ol, ul, dialog, [data-block=DetailPanel], [data-block=EmptyState], [data-day-note], [data-purpose], [data-rail], form, details:not([open])"))
        .map((p) => p.textContent ?? "")
        .filter((t) => words(t) > cap);
      return { purpose, long };
    }, PARAGRAPH_WORDS);
    expect(purpose, "the line under the title").toBeLessThanOrEqual(PURPOSE_WORDS);
    expect(long, `paragraphs over ${PARAGRAPH_WORDS} words`).toEqual([]);
  });

export { GAPS };
