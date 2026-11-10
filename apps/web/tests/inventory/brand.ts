// BrandMark's rules, as checks (docs/frontend/SPEC.md §3 "The logo", §5 BrandMark): run on every screen the inventory opens, in both
// themes. The file served is byte-identical to its source in docs/brand/cornerstone-logo/SVG-vector; nothing filters, shadows,
// transforms or stretches it; clear space of a quarter of its height on every side; the file for the ground (and for the room).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const SRC = path.resolve(__dirname, "../../../../docs/brand/cornerstone-logo/SVG-vector");
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** The file the school's rules ask for: the lockup on a bar, the mark alone where the room is small (700 px or less); on a dark ground the white-tile / dark-ground files. */
export const fileFor = (dark: boolean, width: number, size: "bar" | "large" = "bar") =>
  `Cornerstone-logo-${size === "bar" && width <= 700 ? (dark ? "mark-on-white-tile" : "mark") : dark ? "lockup-for-dark-backgrounds" : "lockup-colour"}.svg`;

export async function brandRules(page: Page, scheme: "light" | "dark", width: number, label: string): Promise<string[]> {
  const out: string[] = [];
  const img = page.locator("picture[data-brand-mark] img:not([data-sample] *)");
  if ((await img.count()) !== 1) return [`${label}: ${await img.count()} BrandMark images, not one`];
  const got = await img.evaluate((e: HTMLImageElement) => {
    const chain: { filter: string; shadow: string; transform: string }[] = [];
    for (let n: Element | null = e; n && n !== document.body; n = n.parentElement) {
      const st = getComputedStyle(n);
      chain.push({ filter: st.filter, shadow: st.boxShadow, transform: st.transform });
      if (n.hasAttribute("data-bar")) break;
    }
    const r = e.getBoundingClientRect();
    const mine = new Set<Element>();
    for (let n: Element | null = e; n; n = n.parentElement) mine.add(n);
    const near: number[] = [];
    for (const o of document.querySelectorAll("body *")) {
      if (mine.has(o) || o.contains(e) || e.parentElement?.contains(o)) continue;
      const q = o.getBoundingClientRect();
      if (!q.width || !q.height || getComputedStyle(o).visibility === "hidden" || o.closest("[hidden]")) continue;
      const gx = Math.max(q.left - r.right, r.left - q.right);
      const gy = Math.max(q.top - r.bottom, r.top - q.bottom);
      near.push(gx < 0 && gy < 0 ? 0 : gx < 0 ? gy : gy < 0 ? gx : Math.hypot(gx, gy));
    }
    return { src: new URL(e.currentSrc).pathname, alt: e.alt, w: r.width, h: r.height, chain, near: Math.min(...near, 1e9), natural: [e.naturalWidth, e.naturalHeight], linked: e.closest("a")?.getAttribute("href") ?? null };
  });
  const want = fileFor(scheme === "dark", width, (await page.locator("[data-frame=bare]").count()) ? "large" : "bar");
  if (path.basename(got.src) !== want) out.push(`${label}: BrandMark shows ${path.basename(got.src)} in ${scheme} at ${width}, the school's rule is ${want}`);
  const bytes = await (await page.request.get(got.src)).body();
  const source = readFileSync(path.join(SRC, path.basename(got.src)));
  if (sha(bytes) !== sha(source)) out.push(`${label}: the BrandMark file served is not byte-identical to docs/brand/cornerstone-logo/SVG-vector/${path.basename(got.src)}`);
  const m = source.toString().match(/<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/);
  if (m && Math.abs(got.w / got.h - Number(m[1]) / Number(m[2])) > 0.02) out.push(`${label}: BrandMark is stretched: ${got.w.toFixed(1)} × ${got.h.toFixed(1)} against the file's ${m[1]} × ${m[2]}`);
  got.chain.forEach((c, i) => {
    if (c.filter !== "none") out.push(`${label}: a filter (${c.filter}) on BrandMark or an ancestor (${i})`);
    if (c.shadow !== "none") out.push(`${label}: a box-shadow on BrandMark or an ancestor (${i})`);
    if (c.transform !== "none") out.push(`${label}: a transform (${c.transform}) on BrandMark or an ancestor (${i})`);
  });
  if (got.near < got.h / 4) out.push(`${label}: another element is ${got.near.toFixed(1)} px from BrandMark, under a quarter of its height (${(got.h / 4).toFixed(1)})`);
  if (got.alt !== "Cornerstone Gurukul") out.push(`${label}: BrandMark's accessible name is “${got.alt}”`);
  return out;
}
