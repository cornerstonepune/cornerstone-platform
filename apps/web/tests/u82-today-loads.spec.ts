/**
 * U82 — Today loads properly, for every person and every day (Nimish, 11 Nov 2026: "A new Today page should load properly when we open
 * it, so fine-tune all those edge cases as well"). Each edge case is one test: never a 404, never the error page, never a blank strip,
 * never a count that disagrees with its list; when there is nothing, or nothing can be read, the page says why in words.
 *
 * The reads are tested as functions against a door that answers as a broken or slow engine would (as p3 does), because the test's
 * website talks to one live engine; the page's handling of a refusal is then seen on the page itself (no class, switched off).
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { menu } from "./menu";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import postgres from "postgres";
import { loadFortnight10, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import { ENGINE_SLOW } from "../lib/engine";
import { PAGE_WAIT_MS } from "../lib/deadline";
import { myDay, myNotes, noteFigures, TODAY_WAIT_MS } from "../lib/today-data";
import { blankWords } from "../lib/educator/period";
import { dayWords } from "../lib/today";

const HOLIDAY = "2026-11-11"; // the Diwali vacation, as on live today
const BUFFER = "2026-11-19"; // Buffer week 2: a school day in no fortnight
const FIRST = "2026-11-23"; // Fortnight 10 begins (supabase/seed/k2_tabs_2026_11_04)

// ---- the reads, against an engine that is not answering, is slow, or refuses ----
test.describe("the reads", () => {
  let door: Server;
  const saved = { url: process.env.ENGINE_URL, key: process.env.ENGINE_KEY };
  let mode: "down" | "slow" | "refuses" = "down";
  test.beforeAll(async () => {
    door = createServer((req, res) => {
      if (mode === "slow") return void setTimeout(() => res.writeHead(200, { "content-type": "application/json" }).end("{}"), TODAY_WAIT_MS + 3_000);
      if (mode === "refuses") return void res.writeHead(403, { "content-type": "application/json" }).end(JSON.stringify({ detail: "No class is yours on this day." }));
      res.writeHead(502).end();
    });
    await new Promise<void>((done) => door.listen(0, "127.0.0.1", done));
    process.env.ENGINE_URL = `http://127.0.0.1:${(door.address() as AddressInfo).port}`;
    process.env.ENGINE_KEY = "u82";
  });
  test.afterAll(async () => {
    door.closeAllConnections();
    await new Promise((done) => door.close(done));
    process.env.ENGINE_URL = saved.url;
    process.env.ENGINE_KEY = saved.key;
  });

  test("an engine that is not answering is a sentence, and no note is counted (not a 0 that may be false)", async () => {
    mode = "down";
    const day = await myDay({ email: "u82-down@cornerstone.test" }, HOLIDAY);
    expect(day).toMatchObject({ ok: false, down: true });
    const notes = await myNotes({ email: "u82-down@cornerstone.test" });
    expect(noteFigures(notes)).toBeNull();
  });

  test("a slow engine gives up before the frame's deadline, so the page is never the error page, and says it was slow", async () => {
    expect(TODAY_WAIT_MS).toBeLessThan(PAGE_WAIT_MS);
    mode = "slow";
    const t = Date.now();
    const day = await myDay({ email: "u82-slow@cornerstone.test" }, HOLIDAY);
    expect(Date.now() - t).toBeLessThan(PAGE_WAIT_MS);
    expect(day).toEqual({ ok: false, down: true, words: ENGINE_SLOW });
  });

  test("a refusal is an answer: its own words come through, and she has no notes waiting (0, not unknown)", async () => {
    mode = "refuses";
    expect(await myDay({ email: "u82-refused@cornerstone.test" }, HOLIDAY)).toEqual({ ok: false, down: false, words: "No class is yours on this day." });
    expect(noteFigures(await myNotes({ email: "u82-refused@cornerstone.test" }))).toEqual({ late: 0, soon: 0 });
  });
});

test("a day with no lesson says why in the school's words, never lower-cased and never 'no school day' for a school day", () => {
  expect(blankWords({ kind: "holiday", note: "Diwali Break", fortnight: null })).toBe("Holiday: Diwali Break.");
  expect(blankWords({ kind: "teaching", note: "Buffer Week 2", fortnight: null })).toBe("Buffer Week 2. This day is in no fortnight, so no lesson is planned.");
  expect(blankWords({ kind: "teaching", note: null, fortnight: { number: 10, starts_on: FIRST, ends_on: "2026-12-04" } })).toBe("No lesson is planned for this day.");
  expect(blankWords({ kind: "none", note: null, fortnight: null })).toBe("No school day on record.");
});

// ---- the page, as each person opens it ----
test.describe("the page", () => {
  test.describe.configure({ mode: "serial" });
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
  const TEACHER = { email: "u82-educator@cornerstone.test", name: "Holiday Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };
  const NOCLASS = { email: "u82-noclass@cornerstone.test", name: "Classless Educator", role: "educator", classes: ["U82-NONE"], subjects: ["NUM"] };
  const kept: { t: string; campus: string; day: string; had: { kind: string; note: string | null } | null }[] = [];
  let klassId = "";
  /** "Fortnight N starts <day>.": the class's next teaching fortnight after a day, as the database holds it (other specs add fortnights
   *  to the test's year, so it is read, not assumed to be Fortnight 10). */
  const nextWords = async (after: string) => {
    const [f] = await sql<{ number: number; starts_on: string }[]>`
      select f.number, f.starts_on::text from fortnight f join school_class c on c.tenant_id = f.tenant_id and c.academic_year_id = f.academic_year_id
      where c.id = ${klassId}::uuid and f.kind = 'teaching' and f.starts_on > ${after}::date order by f.starts_on limit 1`;
    expect(f, `a fortnight after ${after}`).toBeTruthy();
    return `Fortnight ${f.number} starts ${dayWords(f.starts_on)}.`;
  };

  test.beforeAll(async () => {
    const { klass } = await k2Class(sql);
    loadFortnight10(SECTION);
    await timetableSwitch(sql, true);
    for (const p of [TEACHER, NOCLASS]) if (!(await personAsStored(sql, p.email))) await aPerson(sql, p);
    const [{ tenant_id: t, campus_id: campus }] = await sql<{ tenant_id: string; campus_id: string }[]>`select tenant_id, campus_id from school_class where id = ${klass}`;
    const [mine] = await sql<{ staff_id: string }[]>`select staff_id from pii.staff where email = ${TEACHER.email}`;
    await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
      select ${t}, ${mine.staff_id}, 'cover_educator', ${klass}, '2026-11-01', 'u82 test'
      where not exists (select 1 from staff_role_grant where staff_id = ${mine.staff_id} and school_class_id = ${klass})`;
    // the vacation and the buffer week as the school's calendar has them: a holiday, and a school day that is in no fortnight. Another
    // spec may have written these days already (CI: 11 Nov as a plain teaching day), so the test sets them and puts back what was there.
    for (const [day, kind, note] of [[HOLIDAY, "holiday", "Diwali Break"], [BUFFER, "teaching", "Buffer Week 2"]]) {
      const [had] = await sql<{ kind: string; note: string | null }[]>`select kind, note from school_day where tenant_id = ${t} and campus_id = ${campus} and on_date = ${day}`;
      kept.push({ t, campus, day, had: had ?? null });
      await sql`insert into school_day (tenant_id, campus_id, on_date, kind, note) values (${t}, ${campus}, ${day}, ${kind}, ${note})
        on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind, note = excluded.note`;
    }
    klassId = klass;
  });
  test.afterAll(async () => {
    for (const k of kept)
      if (k.had) await sql`update school_day set kind = ${k.had.kind}, note = ${k.had.note} where tenant_id = ${k.t} and campus_id = ${k.campus} and on_date = ${k.day}`;
      else await sql`delete from school_day where tenant_id = ${k.t} and campus_id = ${k.campus} and on_date = ${k.day}`;
    await timetableSwitch(sql, false);
    await sql.end();
  });

  const as = async (browser: Browser, email: string, width = 1440) => {
    const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 900 } });
    await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    return context;
  };
  /** Opened with nothing cached: the page answers 200, has its one h1 and never the error page. */
  const opens = async (p: Page, url: string, h1: string) => {
    const res = await p.goto(url);
    expect(res?.status(), url).toBe(200);
    await expect(p.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(p.getByText("This page could not load")).toHaveCount(0);
  };
  /** The strip is never drawn empty, and the bar's count is its do-now plus this-week (none when both are 0). */
  const stripAgreesWithBadge = async (p: Page) => {
    const strip = p.locator("[data-block=AttentionStrip]");
    if (await strip.count()) await expect(strip.locator(".b-att").first()).toBeVisible();
    const waiting = await p.locator(".b-att").evaluateAll((els) => els.filter((e) => /do now|this week/i.test(e.textContent ?? "")).reduce((n, e) => n + Number((e.querySelector(".b-n")?.textContent ?? "0").trim()), 0));
    const badge = (await menu(p)).getByTestId("waiting");
    if (waiting) await expect(badge).toHaveText(String(waiting));
    else await expect(badge).toHaveCount(0);
  };

  test("on a holiday in no fortnight, her Today says it is a holiday and when the next fortnight starts; no period, no error", async ({ browser }) => {
    const ctx = await as(browser, TEACHER.email);
    const p = await ctx.newPage();
    await opens(p, `/today?day=${HOLIDAY}`, "Today");
    await expect(p.locator("main")).toContainText(`No sessions on this day. Holiday: Diwali Break. ${await nextWords(HOLIDAY)}`);
    await expect(p.locator("[data-block=PeriodRow]")).toHaveCount(0);
    await stripAgreesWithBadge(p);
    await ctx.close();
  });

  test("in the buffer week, a school day in no fortnight is said as that, not as 'no school day on record'", async ({ browser }) => {
    const ctx = await as(browser, TEACHER.email);
    const p = await ctx.newPage();
    await opens(p, `/today?day=${BUFFER}`, "Today");
    await expect(p.locator("main")).toContainText(`Buffer Week 2. This day is in no fortnight, so no lesson is planned. ${await nextWords(BUFFER)}`);
    await expect(p.locator("main")).not.toContainText("No school day on record");
    await ctx.close();
  });

  test("an educator who holds no class is told so in the engine's words, and the page still loads", async ({ browser }) => {
    const ctx = await as(browser, NOCLASS.email);
    const p = await ctx.newPage();
    await opens(p, `/today?day=${FIRST}`, "Today");
    await expect(p.locator("main")).toContainText("No class is yours on this day.");
    await expect(p.locator("[data-block=PeriodRow]")).toHaveCount(0);
    await stripAgreesWithBadge(p);
    await ctx.close();
  });

  test("with the timetable switched off, the educator is told so, not shown a 404", async ({ browser }) => {
    await timetableSwitch(sql, false);
    try {
      const ctx = await as(browser, TEACHER.email);
      const p = await ctx.newPage();
      await opens(p, `/today?day=${FIRST}`, "Today");
      await expect(p.locator("main")).toContainText("The timetable is not switched on.");
      await stripAgreesWithBadge(p);
      await ctx.close();
    } finally {
      await timetableSwitch(sql, true);
    }
  });

  test("a day in the address that is not a date opens today, never 'not found'", async ({ browser }) => {
    const ctx = await as(browser, TEACHER.email);
    const p = await ctx.newPage();
    await opens(p, "/today?day=not-a-day", "Today");
    await ctx.close();
  });

  test("the coordinator gets the school's Today; acting as an educator, the educator's, and the bar's count follows the page", async ({ page, context }) => {
    await opens(page, "/today", "Today, the school");
    await stripAgreesWithBadge(page);
    await context.addCookies([{ name: "cs_acting_as", value: "educator", domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    await opens(page, "/today", "Today");
    await stripAgreesWithBadge(page);
    await context.clearCookies({ name: "cs_acting_as" });
  });

  test("at phone width (400 px) both Todays load with one h1 and no sideways scroll", async ({ browser }) => {
    for (const email of [TEACHER.email, NOCLASS.email]) {
      const ctx = await as(browser, email, 400);
      const p = await ctx.newPage();
      await opens(p, `/today?day=${HOLIDAY}`, "Today");
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await ctx.close();
    }
  });
});
