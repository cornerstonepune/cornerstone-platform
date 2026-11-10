// THROWAWAY: where the time goes on the pages u71 holds to a second. Not to be merged.
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
test.afterAll(async () => sql.end());
test.use({ viewport: { width: 1440, height: 900 } });

const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("probe: where the time goes", async ({ page }) => {
  test.setTimeout(300_000);
  const [{ id: child }] = await sql<{ id: string }[]>`select id from child_now where section = 'U71-BIG' order by roll_order(roll_no) limit 1`;
  const urls = ["/today", "/growth?class=U71-BIG", "/growth?class=U71-BIG&topic=ADDSUB", `/growth/${child}`];
  for (const url of urls) {
    await page.goto(url);
    const rows: Record<string, number>[] = [];
    for (let k = 0; k < 9; k++) {
      const t = Date.now();
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const wall = Date.now() - t;
      const m = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const rs = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const by = (f: (r: PerformanceResourceTiming) => boolean) => rs.filter(f);
        const js = by((r) => /\.js(\?|$)/.test(r.name));
        const css = by((r) => /\.css(\?|$)/.test(r.name));
        const sum = (a: PerformanceResourceTiming[]) => a.reduce((s, r) => s + r.encodedBodySize, 0);
        return {
          ttfb: n.responseStart,
          html: n.responseEnd,
          dcl: n.domContentLoadedEventEnd,
          load: n.loadEventEnd,
          htmlKB: Math.round(n.encodedBodySize / 1024),
          nodes: document.getElementsByTagName("*").length,
          jsN: js.length,
          jsKB: Math.round(sum(js) / 1024),
          cssN: css.length,
          cssKB: Math.round(sum(css) / 1024),
          resN: rs.length,
        };
      });
      rows.push({ wall, ...m });
    }
    const keys = Object.keys(rows[0]);
    console.log(`probe | ${url} | ` + keys.map((k) => `${k}=${med(rows.map((r) => r[k]))}`).join(" "));
  }
});
