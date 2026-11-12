/**
 * U82 — the Timetable grid draws for a coordinator who holds no class, on a dataset like live's K2 (Nimish, 12 Nov 2026: "still some set of
 * lines"): a class with 129 lessons in a fortnight still in planning, 15 periods (two of them fixed bands), the switch off as live has it.
 * The engine lets the school's coordinators read any class (educator_gate.sees_all); the page must then draw a block for every lesson, in a
 * subject's colour, never the "could not be shown" message. Local copy only.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, aSetting, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const COORDINATOR = { email: "u82-coordinator@cornerstone.test", name: "Timetable Coordinator Eighty-Two", role: "coordinator", classes: [], subjects: [] };
const NUMBER = 8201;
const LESSONS = 129;
let klass = "";
let wasOn = false;
let restoreLooks: () => Promise<void>;

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test.beforeAll(async () => {
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} limit 1`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2046-47', '2026-01-01', '2050-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  [{ id: klass }] = await sql<{ id: string }[]>`
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, 'G4', 'U82', 'U82')
    on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set section = excluded.section returning id`;
  const [{ monday }] = await sql<{ monday: string }[]>`select (date_trunc('week', (now() at time zone 'Asia/Kolkata')::date)::date + 70)::text as monday`;
  await sql`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state)
    values (${tenant}, ${year}, ${NUMBER}, 'teaching', ${monday}::date, ${monday}::date + 11, 'planning')
    on conflict (tenant_id, academic_year_id, starts_on) do update set number = ${NUMBER}, kind = 'teaching', ends_on = excluded.ends_on, state = 'planning'`;
  // 15 periods: 13 lessons and 2 fixed bands, a day of them
  const periods: { id: string; fixed: boolean; subject: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const fixed = i === 3 || i === 9;
    const at = `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${tenant}, 'G4', ${820 + i}, ${at}::time, ${fixed ? "Break" : `U82 P${i + 1}`}, ${fixed})
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label, fixed = excluded.fixed returning id`;
    periods.push({ id: p.id, fixed, subject: i % 2 ? "ENG" : "NUM" });
  }
  let made = 0;
  for (let i = 0; i < 12; i++) {
    const [d] = await sql<{ on: string; dow: number }[]>`select (${monday}::date + ${i}::int)::text as on, extract(isodow from ${monday}::date + ${i}::int)::int as dow`;
    if (d.dow > 5) continue;
    const [day] = await sql<{ id: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${d.on}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
    for (const p of periods) {
      if (!p.fixed && made === LESSONS) continue;
      if (!p.fixed) made++;
      await sql`
        insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
        values (${tenant}, ${klass}, ${day.id}, ${p.id}, ${p.fixed ? null : p.subject}, ${p.fixed ? "fixed" : "subject"}, 'planned', true, ${p.fixed ? "Break" : `${p.subject} lesson`})
        on conflict (school_class_id, school_day_id, period_id) do nothing`;
    }
  }
  if (!(await personAsStored(sql, COORDINATOR.email))) await aPerson(sql, COORDINATOR);
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, false); // as live: nothing is switched on for educators
  restoreLooks = await aSetting(sql, "timetable.subject_looks", { NUM: "numeracy", ENG: "language" });
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await restoreLooks?.();
  await sql.end();
});

test("a coordinator holding no class sees the grid of a planning fortnight: a block for each of the 129 lessons, never the refusal", async ({ browser }) => {
  const page = await as(browser, COORDINATOR.email);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from session where school_class_id = ${klass} and kind <> 'fixed'`;
  expect(n).toBe(LESSONS);
  const res = await page.goto(`/timetable?class=${klass}&fn=${NUMBER}&view=fortnight`);
  expect(res?.status()).toBe(200);
  await expect(page.locator("[data-grid-refused]")).toHaveCount(0);
  await expect(page.getByText(/could not be read just now/)).toHaveCount(0);
  const grid = page.locator("[data-block=FortnightGrid]");
  await expect(grid.locator(".b-dh")).toHaveCount(10);
  await expect(grid.locator("a.b-cell")).toHaveCount(LESSONS);
  await expect(grid.locator(".b-band")).toHaveCount(2); // the fixed parts of the day are bands
  await expect(page.locator("[data-fortnight-state=planning]")).toContainText("not live yet");
  // each block is tinted by its subject, and two subjects are two colours (numeracy and language)
  const looks = await grid.locator("a.b-cell").evaluateAll((els) => els.map((e) => [e.getAttribute("data-subject"), getComputedStyle(e).backgroundColor] as const));
  const by = new Map(looks);
  expect([...by.keys()].sort()).toEqual(["language", "numeracy"]);
  expect(new Set(by.values()).size).toBe(2);
  // the week view (the default) draws one week of it, and the Move on each block is the coordinator's
  await page.goto(`/timetable?class=${klass}&fn=${NUMBER}`);
  await expect(grid.locator(".b-dh")).toHaveCount(5);
  const move = grid.locator("[data-move-lesson]");
  expect(await move.count()).toBeGreaterThan(0);
  expect(await move.first().getAttribute("href")).toMatch(new RegExp(`^/timetable/moves\\?fn=${NUMBER}&class=${klass}&from=`));
  await page.context().close();
});

test("the same page at a phone's width draws the grid with no sideways scroll of the page", async ({ browser }) => {
  const page = await as(browser, COORDINATOR.email, 400);
  await page.goto(`/timetable?class=${klass}&fn=${NUMBER}&view=week`);
  await expect(page.locator("[data-block=FortnightGrid] a.b-cell").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.context().close();
});
