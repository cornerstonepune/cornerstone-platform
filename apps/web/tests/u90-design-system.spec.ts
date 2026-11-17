/**
 * U90 — one design system (CP-65, Nimish 17 Nov 2026: "dull, inconsistent, badly organised"). Held on every page of the menu, at 1440 and 400 px:
 * a white page; at most three font sizes (24 title, 16 body, 14 small) in two weights; cards that never touch and sit a scale step apart
 * (12, 20, 32, 48 or 64 px); every table with explicit, even column widths. The tokens are docs/frontend/tokens.json.
 */
import { expect, test, type Page } from "@playwright/test";

const ROUTES = ["/today", "/timetable", "/children", "/children/assessments", "/setup/curriculum", "/setup/staff"];
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 400, height: 800 }];
const SIZES = [14, 16, 24];
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

for (const vp of VIEWPORTS)
  test.describe(`at ${vp.width}px`, () => {
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
      test(`${route}: every table fixes its column widths`, async ({ page }) => {
        await page.goto(route);
        const loose = await page.evaluate(() => [...document.querySelectorAll("table")].filter((t) => getComputedStyle(t).display !== "none" && !t.querySelector("colgroup col[style*=width], colgroup col[width]")).length);
        expect(loose, "tables without a colgroup of widths").toBe(0);
      });
    }
  });

// The word budget (CP-65, Nimish 17 Nov 2026: main pages are for glancing; details open on click): the line under the title is at most 10
// words, and no loose paragraph on a main page runs past 14 words. Paragraphs inside a table, a list, the detail panel, an empty state or a
// day's own note are data or a message, not page copy. Chosen from what the six redesigned pages need: the longest is "Week A and week B, a block per period."
const PURPOSE_WORDS = 10;
const PARAGRAPH_WORDS = 14;
for (const route of ROUTES)
  test(`${route}: word budget`, async ({ page }) => {
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
