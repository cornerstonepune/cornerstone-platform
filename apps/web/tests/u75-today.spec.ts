/**
 * U75 (UI-7) — Today, both kinds (specs/UI-7/spec.md). The rules that make the figures are tested as functions (the same code
 * the page runs); the page is tested as each kind of person sees it. Fortnight 10 as the school wrote it is the timetable
 * (Monday 23 November 2026 is a teaching day of week A); the page takes the day in its address, so the test needs no clock.
 */
import { expect, test, type Browser } from "@playwright/test";
import postgres from "postgres";
import { loadFortnight10, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";
import { sessionFor, signedInAs } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import type { Period } from "../lib/educator/types";
import { dayWords, litPeriod, many, periodsDone, splitNotes } from "../lib/today";

const HOUR = 3_600_000;
const note = (id: string, hoursOld: number, now: number) => ({ id, class_id: "c", status: "drafted", received_at: new Date(now - hoursOld * HOUR).toISOString() });
const lesson = (id: string, starts_at: string, ends_at: string | null, state: Period["state"] = "planned"): Period => ({ period_id: id, starts_at, ends_at, label: id, name: id, fixed: false, kind: "subject", subject: "numeracy", text: "", line: null, state, activity: null });
const brk = (id: string, starts_at: string, ends_at: string): Period => ({ ...lesson(id, starts_at, ends_at), fixed: true, kind: "fixed", subject: null });

test("a note is late or waiting, never both: the strip's two tiles share no note", () => {
  const now = Date.parse("2026-11-18T10:00:00Z");
  const notes = [note("a", 49, now), note("b", 47, now), note("c", 48, now), note("d", 1, now)];
  const { late, soon } = splitNotes(notes, now, 48);
  expect(late.map((n) => n.id)).toEqual(["a", "c"]);
  expect(soon.map((n) => n.id)).toEqual(["b", "d"]);
  expect(late.length + soon.length).toBe(notes.length);
});

test("the lit row is the lesson whose period holds the current time; before 08:30 none, and a break is never lit", () => {
  const day = [brk("settle", "08:30", "08:45"), lesson("one", "08:45", "09:25"), lesson("two", "09:25", "10:05"), brk("snack", "10:05", "10:20"), lesson("last", "10:20", null)];
  expect(litPeriod(day, "08:00")).toBeNull();
  expect(litPeriod(day, "08:29")).toBeNull();
  expect(litPeriod(day, "08:35")).toBeNull();
  expect(litPeriod(day, "08:45")).toBe("one");
  expect(litPeriod(day, "09:24")).toBe("one");
  expect(litPeriod(day, "09:25")).toBe("two");
  expect(litPeriod(day, "10:10")).toBeNull();
  expect(litPeriod(day, "13:00")).toBe("last");
});

test("the done tile counts the lessons taught of those planned; a break is not planned work", () => {
  const day = [brk("settle", "08:30", "08:45"), lesson("one", "08:45", "09:25", "done"), lesson("two", "09:25", "10:05"), lesson("three", "10:20", null, "done")];
  expect(periodsDone(day)).toEqual({ done: 2, planned: 3 });
});

test("words: the day, and a count", () => {
  expect(dayWords("2026-11-18")).toBe("Wednesday 18-Nov");
  expect(many(1, "note")).toBe("1 note");
  expect(many(3, "child", "children")).toBe("3 children");
});

const as = async (browser: Browser, email: string) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
};

test.describe("the page", () => {
  test.describe.configure({ mode: "serial" });
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
  const MONDAY = "2026-11-23";
  const TEACHER = { email: "u75-educator@cornerstone.test", name: "Today Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };
  const OTHER = { email: "u75-other@cornerstone.test", name: "Other Educator", role: "educator", classes: ["U75-NONE"], subjects: ["NUM"] };

  test.beforeAll(async () => {
    const { klass } = await k2Class(sql);
    loadFortnight10(SECTION);
    await timetableSwitch(sql, true);
    for (const p of [TEACHER, OTHER]) if (!(await personAsStored(sql, p.email))) await aPerson(sql, p);
    const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
    const [mine] = await sql<{ staff_id: string }[]>`select staff_id from pii.staff where email = ${TEACHER.email}`;
    await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
      select ${tenant}, ${mine.staff_id}, 'cover_educator', ${klass}, current_date - 1, 'u75 test'
      where not exists (select 1 from staff_role_grant where staff_id = ${mine.staff_id} and school_class_id = ${klass})`;
  });
  test.afterAll(async () => {
    await timetableSwitch(sql, false);
    await sql.end();
  });

  test("the coordinator is given the school's Today, the educator the educator's, and neither is given the other's", async ({ page, browser }) => {
    await page.goto("/today/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Today, the school");
    const mine = await signedInAs(browser, "educator", { width: 1440, height: 900 });
    const p = await mine.newPage();
    await p.goto("/today/new");
    await expect(p.getByRole("heading", { level: 1 })).toHaveText("Today");
    await mine.close();
  });

  test("an educator sees the periods of the class their grant names, in time order; the other educator sees none of them", async ({ browser }) => {
    const mine = await as(browser, TEACHER.email);
    const p = await mine.newPage();
    await p.goto(`/today/new?day=${MONDAY}`);
    const times = await p.locator("[data-block=PeriodRow] .b-t").allTextContents();
    expect(times.length).toBeGreaterThan(0);
    expect([...times].sort()).toEqual(times);
    await mine.close();
    const other = await as(browser, OTHER.email);
    const q = await other.newPage();
    await q.goto(`/today/new?day=${MONDAY}`);
    await expect(q.locator("[data-block=PeriodRow]")).toHaveCount(0);
    await expect(q.getByText(/No (sessions|timetable)/)).toBeVisible();
    await other.close();
  });

  test("the tiles and the board's lanes count the same rows, and an empty lane says so in words", async ({ browser }) => {
    const mine = await as(browser, TEACHER.email);
    const p = await mine.newPage();
    await p.goto(`/today/new?view=board&day=${MONDAY}`);
    for (const [lane, state] of [["doNow", "do now"], ["doSoon", "this week"], ["done", "done"]] as const) {
      const n = Number(await p.locator(`[data-lane="${lane}"] .b-count`).innerText());
      const tile = Number(await p.locator(".b-att", { hasText: new RegExp(`^\\d+\\s*${state}`, "i") }).locator(".b-n").innerText());
      expect(n, `${lane} lane against its tile`).toBe(tile);
      expect(await p.locator(`[data-lane="${lane}"] .b-kcard`).count()).toBe(n);
      if (n === 0) await expect(p.locator(`[data-lane="${lane}"] .b-lane-empty`)).toHaveText(/\w+ \w+/);
    }
    await mine.close();
  });

  test("neither Today shows a count of skills to approve, and the school's names no person's rank", async ({ page, browser }) => {
    await page.goto("/today/new");
    await expect(page.locator("main")).not.toContainText(/skills? to approve/i);
    await expect(page.locator("main")).not.toContainText(/\b(rank|ranking|score|leaderboard|top|bottom)\b/i);
    const mine = await signedInAs(browser, "educator", { width: 1440, height: 900 });
    const p = await mine.newPage();
    await p.goto("/today/new");
    await expect(p.locator("main")).not.toContainText(/skills? to approve/i);
    await mine.close();
  });
});
