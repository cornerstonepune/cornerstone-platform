// UI-14 proofs: one browser visit of the built site, written as JSON for harness.py (lines 5, 6 and 8).
//   node browser.mjs <out.json>      env: UI14_BASE, UI14_COOKIE (a signed staff session), UI14_PAGES (JSON list
//                                    of signed-in paths; [] when there is no test database), UI14_WEB (apps/web)
// It reads computed styles and the served style sheets; it writes nothing to the site. Nothing it records is a person's
// data: tag names, classes, style values and request addresses only.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.env.UI14_WEB, "package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.UI14_BASE;
const COOKIE = process.env.UI14_COOKIE || "";
const PAGES = JSON.parse(process.env.UI14_PAGES || "[]");
const out = { pages: {}, requests: [], press: [], reduced: [], hover: [], keyframes: [], appleIcon: null };

// In the page: what each visible element shows. Run with page.evaluate.
function survey() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const name = (el) => el.tagName.toLowerCase() + (el.classList.length ? "." + [...el.classList].slice(0, 3).join(".") : "");
  const first = (ff) => ff.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const fonts = {};
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const f = first(getComputedStyle(el).fontFamily);
    (fonts[f] ??= []).length < 3 && fonts[f].push(name(el));
  }
  const pressable = [...document.querySelectorAll("button, a[href]")].filter(
    (el) => visible(el) && !(el.tagName === "A" && getComputedStyle(el).display === "inline"),
  );
  const transitions = pressable.map((el) => {
    const s = getComputedStyle(el);
    return { el: name(el), property: s.transitionProperty, duration: s.transitionDuration, timing: s.transitionTimingFunction };
  });
  const animated = [...document.querySelectorAll("*")]
    .filter((el) => getComputedStyle(el).animationName !== "none")
    .map((el) => ({ el: name(el), animation: getComputedStyle(el).animationName }));
  return { fonts, transitions, animated };
}

// In the page: every :hover rule of the served style sheets with the @media conditions around it, and every @keyframes.
function sheets() {
  const hover = [];
  const keyframes = [];
  const walk = (rules, conds) => {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) walk(r.cssRules, [...conds, r.conditionText || r.media.mediaText]);
      else if (r instanceof CSSKeyframesRule) keyframes.push(r.name);
      else if (r instanceof CSSStyleRule) {
        if (r.selectorText.includes(":hover")) {
          const props = [...r.style].filter((p) => r.style.getPropertyValue(p) !== "");
          hover.push({ selector: r.selectorText.slice(0, 160), conds, props });
        }
        if (r.cssRules?.length) walk(r.cssRules, conds);
      } else if (r.cssRules) walk(r.cssRules, conds);
    }
  };
  for (const s of document.styleSheets) {
    try {
      walk(s.cssRules, []);
    } catch {
      hover.push({ selector: `unreadable sheet ${s.href}`, conds: [], props: [] });
    }
  }
  return { hover, keyframes };
}

async function press(page, where, mode) {
  const found = [];
  for (const kind of ["button", "a"]) {
    const handles = await page.locator(kind === "a" ? "a[href]" : "button").all();
    for (const h of handles) {
      if (!(await h.isVisible())) continue;
      if (kind === "a" && (await h.evaluate((el) => getComputedStyle(el).display)) === "inline") continue;
      const box = await h.boundingBox();
      if (!box) continue;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(400); // past the 160 ms transition
      const s = await h.evaluate((el) => {
        const c = getComputedStyle(el);
        return { transform: c.transform, property: c.transitionProperty, duration: c.transitionDuration, timing: c.transitionTimingFunction };
      });
      await page.mouse.move(0, 0);
      await page.mouse.up();
      found.push({ page: where, mode, kind, ...s });
      break;
    }
  }
  // No database: /login is the only page, and its one link is inline (a transform does not apply to an inline box). The
  // press rule is global, so the same link made a block, as a link-row is, shows it.
  if (!PAGES.length && !found.some((f) => f.kind === "a")) {
    const link = page.locator("a[href]").first();
    if (await link.count()) {
      await link.evaluate((el) => el.setAttribute("data-ui14-row", ""));
      await page.addStyleTag({ content: "a[data-ui14-row] { display: block; }" });
      const box = await link.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(400);
      const s = await link.evaluate((el) => {
        const c = getComputedStyle(el);
        return { transform: c.transform, property: c.transitionProperty, duration: c.transitionDuration, timing: c.transitionTimingFunction };
      });
      await page.mouse.move(0, 0);
      await page.mouse.up();
      found.push({ page: where, mode, kind: "a", forced: "display:block", ...s });
    }
  }
  return found;
}

async function visit(context, p, mode, signedIn) {
  const page = await context.newPage();
  page.on("request", (r) => out.requests.push({ page: p, url: r.url() }));
  const res = await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 60_000 });
  const landed = new URL(page.url()).pathname;
  if (mode === "normal") {
    out.pages[p] = { status: res?.status() ?? 0, landed, signedIn, ...(await page.evaluate(survey)) };
    const { hover, keyframes } = await page.evaluate(sheets);
    out.hover.push(...hover.map((h) => ({ page: p, ...h })));
    out.keyframes.push(...keyframes.map((k) => ({ page: p, name: k })));
  }
  return page;
}

// The signed-in pages need a member of staff in the local test database: the same fake one tests/global-setup.ts makes.
if (PAGES.length) {
  const postgres = require("postgres");
  const sql = postgres(process.env.UI14_DB, { max: 1 });
  const staff = { email: "e2e@cornerstone.test", name: "End-to-end test", role: "coordinator" };
  await sql`update config set value = value || ${sql.json([staff])}
            where key = 'app.staff' and not value @> ${sql.json([{ email: staff.email }])}`;
  const [{ id: school }] = await sql`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql`select id from campus where tenant_id = ${school} limit 1`;
  const [had] = await sql`select staff_id from pii.staff where email = ${staff.email}`;
  const id = had?.staff_id ?? (await sql`insert into staff (tenant_id, campus_id) values (${school}, ${campus}) returning id`)[0].id;
  if (!had) await sql`insert into pii.staff (tenant_id, staff_id, name, email) values (${school}, ${id}, ${staff.name}, ${staff.email})`;
  await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, valid_from, granted_by)
            select ${school}, ${id}, 'deputy_coordinator', current_date - 1, 'UI-14 proofs'
            where not exists (select 1 from staff_role_grant where staff_id = ${id} and role_code = 'deputy_coordinator' and valid_to is null)`;
  await sql.end();
}

const browser = await chromium.launch();
try {
  const host = new URL(BASE).hostname;
  const mk = async (reducedMotion, signed) => {
    const c = await browser.newContext({ reducedMotion, viewport: { width: 1440, height: 900 } });
    if (signed && COOKIE) await c.addCookies([{ name: "cs_staff", value: COOKIE, domain: host, path: "/" }]);
    return c;
  };
  for (const mode of ["normal", "reduce"]) {
    const reducedMotion = mode === "reduce" ? "reduce" : "no-preference";
    const out1 = await mk(reducedMotion, false);
    let page = await visit(out1, "/login", mode, false);
    const pressed = await press(page, "/login", mode);
    if (mode === "normal") {
      const href = await page.evaluate(() => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null);
      out.appleIcon = { href };
      if (href) {
        // signed in: the proxy sends a signed-out request for anything but /login and *.svg to sign-in
        const r = await out1.request.get(new URL(href, BASE).toString(), { headers: { cookie: `cs_staff=${COOKIE}` }, maxRedirects: 0 });
        const body = await r.body();
        out.appleIcon = { href, status: r.status(), type: r.headers()["content-type"] ?? "", head: body.subarray(0, 8).toString("hex") };
      }
    }
    if (mode === "reduce") {
      out.reduced.push({ page: "/login", ...(await page.evaluate(survey)) });
    }
    await out1.close();
    if (PAGES.length) {
      const in1 = await mk(reducedMotion, true);
      const list = mode === "normal" ? PAGES : PAGES.slice(0, 1);
      for (const [i, p] of list.entries()) {
        page = await visit(in1, p, mode, true);
        if (i === 0) {
          pressed.push(...(await press(page, p, mode)));
          if (mode === "reduce") out.reduced.push({ page: p, ...(await page.evaluate(survey)) });
        }
        await page.close();
      }
      await in1.close();
    }
    (mode === "normal" ? out.press : out.reduced).push(...pressed.map((x) => ({ pressed: true, ...x })));
  }
} finally {
  await browser.close();
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
