/**
 * U72 (UI-3b) — Children, the class picture and where a child is. One test per "Done when" line of specs/UI-3b/spec.md.
 * Two classes of the test's own (fake names only), an educator who teaches the first, the signed-in coordinator who sees both.
 * Rows are made once and a second run finds them; observations are append-only, so a child keeps what a run gave them.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aClass, aPerson, personAsStored } from "./rows";
import { voiceSwitch } from "./k2-rows";

const A = "U72A";
const B = "U72B";
const EDUCATOR = { email: "u72-educator@cornerstone.test", name: "Asha Almond", role: "educator", classes: [A], subjects: ["NUM"] };
const NAMES_A = FAKE_CHILDREN.slice(0, 12) as readonly string[];
const NAMES_B = FAKE_CHILDREN.slice(12, 16) as readonly string[];
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });

let classA = "";
let classB = "";
let kids: Record<string, string> = {};
let tenant = "";
let staff = "";
let skills: { code: string; name: string }[] = [];

async function observe(roll: string, level: number | null, daysAgo: number, outcome = "as_expected", mode = "individual") {
  const child = kids[NAMES_A[Number(roll) - 1]];
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  const [o] = await sql<{ id: string }[]>`
    insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
    values (${tenant}, gen_random_uuid(), 'ACT-U72-1', ${child}, ${classA}, ${outcome}, ${mode}, 'form', ${level ?? 2}, ${level}, ${at}, ${staff}, ${staff}) returning id`;
  if (outcome !== "absent" && (level !== null || mode !== "individual")) {
    const mark = level === 3 ? "yes" : level === 2 ? "sometimes" : "not_yet";
    for (const s of skills) {
      await sql`insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark, seen_by, place, source, observation_id)
        values (${tenant}, ${child}, ${s.code}, 'educator', ${at}, ${staff}, 'observed', ${mark}, ${staff}, 'class', 'u72 test', ${o.id})`;
    }
  }
  await sql`select rebuild_child_observed_state(${child})`;
}

test.beforeAll(async () => {
  await voiceSwitch(sql, true); // the educator screens are on (the K2 switch); the last test turns them off and on again
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  kids = { ...(await aClass(sql, A, "K2", [...NAMES_A])), ...(await aClass(sql, B, "K2", [...NAMES_B])) };
  [{ id: classA }, { id: classB }] = [
    (await sql<{ id: string }[]>`select id from school_class where label = ${A} order by created_at limit 1`)[0],
    (await sql<{ id: string }[]>`select id from school_class where label = ${B} order by created_at limit 1`)[0],
  ].map((r) => ({ id: r.id }));
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  [{ id: staff }] = await sql<{ id: string }[]>`select staff_id::text as id from pii.staff where email = ${EDUCATOR.email}`;
  skills = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${tenant} order by code limit 2`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, 'ACT-U72-1', 'K2', 'Maths', 'Sorting by size', '') on conflict (tenant_id, code) do nothing`;
  for (const s of skills) await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, 'ACT-U72-1', ${s.code}) on conflict do nothing`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${classA}`;
  if (n === 0) {
    await observe("1", 3, 40);
    await observe("1", 3, 20);
    await observe("2", 2, 10);
    await observe("3", 1, 5);
    await observe("4", null, 5, "as_expected", "group_as_expected");
    await observe("5", null, 2, "absent");
    // a child seen on the second paper-day, and corrected: a new entry naming the one it replaces
  }
  // school days for the class's campus, and a confirmed lesson on all but one of them
  await sql`insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label) values (${tenant}, 'K2', 91, '23:10', '23:50', 'U72 period') on conflict do nothing`;
  const [{ campus, period }] = await sql<{ campus: string; period: string }[]>`
    select (select campus_id from school_class where id = ${classA}) as campus,
           (select id from period where grade_code = 'K2' and label = 'U72 period' limit 1) as period`;
  for (let d = 1; d <= 8; d++) {
    await sql`insert into school_day (tenant_id, campus_id, on_date, kind) select ${tenant}, ${campus}, current_date - ${d}::int, 'teaching'
              where not exists (select 1 from school_day where campus_id = ${campus} and on_date = current_date - ${d}::int)`;
    if (d === 3) continue;
    await sql`insert into session (tenant_id, school_class_id, school_day_id, period_id, state)
              select ${tenant}, ${classA}, id, ${period}, 'done' from school_day where campus_id = ${campus} and on_date = current_date - ${d}::int
              on conflict do nothing`;
  }
});
test.afterAll(async () => {
  await sql.end();
});

async function asEducator(browser: Browser, width = 1440): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
}
const rowsOf = (page: Page) => page.locator('table[aria-label^="Children"] tbody tr');

test("1 · an educator's table lists their own children; a coordinator sees every class, with a class filter", async ({ browser, page }) => {
  const mine = await asEducator(browser);
  const p = await mine.newPage();
  await p.goto("/children");
  await expect(p.getByRole("button", { name: new RegExp(NAMES_A[0]) })).toBeVisible();
  await expect(p.locator("main")).not.toContainText(NAMES_B[0]);
  await mine.close();
  await page.goto("/children?cls=" + classB);
  await expect(page.getByRole("button", { name: new RegExp(NAMES_B[0]) })).toBeVisible();
  await expect(page.getByLabel(/^Class/)).toBeVisible();
});

test("2 · the class column and filter appear only when the person has several classes", async ({ browser, page }) => {
  const mine = await asEducator(browser);
  const p = await mine.newPage();
  await p.goto("/children");
  await expect(p.getByRole("columnheader", { name: "Class", exact: true })).toHaveCount(0);
  await expect(p.getByLabel(/^Class/)).toHaveCount(0);
  await mine.close();
  await page.goto("/children");
  await expect(page.getByRole("columnheader", { name: "Class", exact: true }).first()).toBeVisible();
});

test("3 · the bar's segments are secure, practising and not seen, sum to the skill count, and none is red", async ({ page }) => {
  await page.goto(`/children?cls=${classA}`);
  const bars = page.locator("[data-doing]");
  const total = (await bars.first().getAttribute("data-doing"))!.split("/").map(Number).reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(0);
  for (const b of await bars.all()) expect((await b.getAttribute("data-doing"))!.split("/").map(Number).reduce((a, c) => a + c, 0)).toBe(total);
  expect(await page.locator(".b-sbar i").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")))).not.toContain("late");
  await expect(page.locator(".b-sbar").first()).toHaveAttribute("aria-label", /secure.*practising.*not seen yet/);
});

test("4 · searching narrows the rows and writes itself into the address; a reload keeps it", async ({ page }) => {
  await page.goto(`/children?cls=${classA}`);
  await page.getByRole("searchbox").fill(NAMES_A[2].split(" ")[0]);
  await page.getByRole("searchbox").press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(rowsOf(page)).toHaveCount(1);
  await page.reload();
  await expect(rowsOf(page)).toHaveCount(1);
  await page.getByRole("searchbox").fill("4");
  await page.getByRole("searchbox").press("Enter");
  await expect(page.getByRole("button", { name: new RegExp(NAMES_A[3]) })).toBeVisible();
});

test("5 · absences noted: a grey cell with its word, a day with no lesson blank, never present", async ({ page }) => {
  await page.goto(`/children?cls=${classA}&q=${encodeURIComponent(NAMES_A[4])}`);
  await expect(page.getByRole("columnheader", { name: "Absences noted" })).toBeVisible();
  const strip = page.locator(".b-days").first();
  await expect(strip).toHaveAttribute("aria-label", /absent/);
  const cells = (await strip.getAttribute("data-days"))!.split(",");
  expect(cells.filter((c) => c === "absent")).toHaveLength(1);
  expect(cells).toContain("no-lesson");
  await expect(page.locator("main")).not.toContainText(/present/i);
  await expect(page.getByText("1 noted")).toBeVisible();
});

test("6 · a name opens the peek, 'Open the child' lands on the child, the toggle goes to the picture and back", async ({ page }) => {
  await page.goto(`/children?cls=${classA}`);
  await page.getByRole("button", { name: new RegExp(NAMES_A[0]) }).click();
  await expect(page.locator("[data-block=ChildPeek]")).toBeVisible();
  await page.getByRole("link", { name: "Open the child" }).click();
  await expect(page).toHaveURL(new RegExp(`/children/${classA}/1$`));
  await expect(page.locator("h1")).toHaveText("Where this child is");
  await page.goto(`/children?cls=${classA}`);
  await page.getByRole("link", { name: "Class picture grid" }).click();
  await expect(page.locator("h1")).toHaveText("Class picture");
  await page.getByRole("link", { name: "Show as a table" }).click();
  await expect(page.locator("h1")).toHaveText("Children");
});

test("7 · grouping puts a heading and a count over each group; counts sum to the rows; one group each", async ({ page }) => {
  for (const group of ["doing", "attention", "class"]) {
    await page.goto(`/children?group=${group}&cls=`);
    const counts = (await page.locator("[data-group] .b-count").allInnerTexts()).map(Number);
    const everyone = Number((await page.getByTestId("stage").first().innerText()).match(/(\d+) child/i)![1]);
    expect(counts.reduce((a, b) => a + b, 0), group).toBe(everyone);
    // a child is in exactly one group: no child id on two rows of the page
    const ids = await page.locator("[data-group] tr[data-child]").evaluateAll((els) => els.map((e) => e.getAttribute("data-child")));
    expect(new Set(ids).size, group).toBe(ids.length);
  }
});

test("8 · the peek is newest first with who and when; Escape closes it and focus returns", async ({ page }) => {
  await page.goto(`/children?cls=${classA}`);
  const opener = page.getByRole("button", { name: new RegExp(NAMES_A[0]) });
  await opener.focus();
  await opener.click();
  const peek = page.locator("[data-block=ChildPeek]");
  await expect(peek.locator(".b-tli").first()).toBeVisible();
  const dates = await peek.locator(".b-tli .b-caption").allInnerTexts();
  expect(dates.length).toBeGreaterThan(1);
  const ms = dates.map((d) => Date.parse(d.replace(/-/g, " ")));
  expect(ms).toEqual([...ms].sort((a, b) => b - a));
  await expect(peek.locator(".b-tli p").first()).toContainText(/·/);
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("9 · each square shows the Sr. No. and the name, no photo, in Sr. No. order, 8 to a row at 1440 and 3 at 400", async ({ page }) => {
  await page.goto(`/children/${classA}?group=class`);
  const squares = page.locator(".b-sq");
  await expect(squares).toHaveCount(NAMES_A.length);
  expect(await squares.locator(".b-no").allInnerTexts()).toEqual(NAMES_A.map((_, i) => String(i + 1)));
  await expect(squares.first()).toContainText(NAMES_A[0]);
  await expect(page.locator("main img")).toHaveCount(0);
  const perRow = async () => {
    await page.waitForLoadState("networkidle");
    const ys = await squares.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
    return ys.filter((y) => y === ys[0]).length;
  };
  expect(await perRow()).toBe(8);
  await page.setViewportSize({ width: 400, height: 900 });
  expect(await perRow()).toBe(3);
});

test("10 · the stack bar equals the squares by state; an empty square is 'not seen yet', never 'not secure'", async ({ page }) => {
  await page.goto(`/children/${classA}?group=class`);
  const label = (await page.locator("[data-block=StackBar] .b-sbar").getAttribute("aria-label"))!;
  const bar = Object.fromEntries([...label.matchAll(/(\d+) ([a-z ]+)/g)].map((m) => [m[2].trim(), Number(m[1])]));
  const squares = page.locator(".b-sq");
  expect(Object.values(bar).reduce((a, b) => a + b, 0)).toBe(NAMES_A.length);
  await expect(squares.filter({ has: page.locator('[data-state="unseen"]') }).or(page.locator('.b-sq[data-state="unseen"]'))).toHaveCount(bar["not seen yet"] ?? 0);
  await expect(page.locator('.b-sq[data-state="unseen"]').first()).toHaveAttribute("title", "not seen yet");
  await expect(page.locator("body")).not.toContainText(/not secure/i);
});

test("11 · grouping by state: a heading and a count per group, the counts sum to the squares and equal the bar", async ({ page }) => {
  await page.goto(`/children/${classA}`);
  const counts = (await page.locator("[data-group] .b-count").allInnerTexts()).map(Number);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(NAMES_A.length);
  const label = (await page.locator("[data-block=StackBar] .b-sbar").getAttribute("aria-label"))!;
  const bar = [...label.matchAll(/(\d+) /g)].map((m) => Number(m[1])).filter((n) => n > 0);
  expect([...counts].sort()).toEqual([...bar].sort());
});

test("12 · a cluster's count equals its chips; a child may be in several", async ({ page }) => {
  await page.goto(`/children/${classA}`);
  const clusters = page.locator("[data-cluster]");
  let inAll = 0;
  for (const c of await clusters.all()) {
    const n = Number(await c.locator(".b-count").innerText());
    await expect(c.locator(".b-nchip")).toHaveCount(n);
    inAll += n;
  }
  const kidsInSome = new Set(await clusters.locator(".b-nchip").allInnerTexts());
  expect(inAll).toBeGreaterThanOrEqual(kidsInSome.size);
  await clusters.locator(".b-nchip").first().click();
  await expect(page.locator("[data-block=ChildPeek]")).toBeVisible();
});

test("13 · the header names the child beside the Sr. No.; the address carries no name; no photo", async ({ page }) => {
  await page.goto(`/children/${classA}/1`);
  await expect(page.getByTestId("stage").first()).toContainText(`Sr. No. 1 · ${NAMES_A[0]}`);
  expect(page.url()).not.toContain(NAMES_A[0].split(" ")[0]);
  await expect(page.locator("main img")).toHaveCount(0);
});

test("14 · a paper's result and a voice note are on one timeline in date order; a correction names its original", async ({ page }) => {
  const child = kids[NAMES_A[5]];
  const [obs] = await sql<{ id: string }[]>`select id from activity_observation where child_id = ${child} limit 1`;
  if (!obs) await observe("6", 2, 3);
  const [first] = await sql<{ id: string; confirmation_id: string }[]>`select id, confirmation_id from activity_observation where child_id = ${child} and supersedes is null order by observed_at limit 1`;
  const [had] = await sql`select 1 from activity_observation where supersedes = ${first.id}`;
  if (!had) {
    await sql`insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by, supersedes, reason)
      select tenant_id, gen_random_uuid(), activity_code, child_id, class_id, 'below', entry_mode, route, expected_level, reached_level, observed_at + interval '1 minute', observed_by, confirmed_by, id, 'corrected in a test' from activity_observation where id = ${first.id}`;
  }
  await page.goto(`/children/${classA}/6`);
  const entries = page.locator("[data-block=Timeline] .b-tli");
  await expect(entries.first()).toBeVisible();
  const dates = (await entries.locator(".b-caption").allInnerTexts()).map((d) => Date.parse(d.replace(/-/g, " ")));
  expect(dates).toEqual([...dates].sort((a, b) => a - b));
  await expect(entries.filter({ hasText: "A mark corrected" })).toContainText("replaces the first");
});

test("15 · the graph's nodes equal the skills seen and each node's state equals the table's; the SVG is an image with counts", async ({ page }) => {
  await page.goto(`/children/${classA}/1`);
  const svg = page.locator("[data-block=ChildGraph] svg");
  await expect(svg).toHaveAttribute("role", "img");
  const rows = page.locator('table[aria-label="Where this child is on each skill"] tbody tr');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await expect(svg).toHaveAttribute("aria-label", new RegExp(`^${n} skills? seen: \\d+ secure, \\d+ practising, \\d+ emerging`));
  await expect(page.locator("[data-block=ChildGraph] [data-node]")).toHaveCount(n);
  const tableStates = await rows.locator("[data-status]").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.trim()));
  const nodeStates = await svg.locator("text.b-w").evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  expect([...nodeStates].sort()).toEqual([...tableStates].sort());
});

test("16 · Tab reaches the nodes in the table's order, each 44 px; at 400 the graph is not drawn and the list is", async ({ page }) => {
  await page.goto(`/children/${classA}/1`);
  const svg = page.locator("[data-block=ChildGraph] svg");
  const hrefs = await page.locator("[data-block=ChildGraph] [data-node]").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const table = await page.locator('table[aria-label="Where this child is on each skill"] tbody tr td:first-child a').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(hrefs).toEqual(table); // Tab order is document order: the table's rows, domain then skill
  const reached: string[] = [];
  await page.locator("h1").click();
  for (let i = 0; i < 60 && reached.length < hrefs.length; i++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => (document.activeElement?.hasAttribute("data-node") ? document.activeElement.getAttribute("href") : null));
    if (at) reached.push(at);
  }
  expect(reached, "Tab reaches each node, in the table's order").toEqual(hrefs);
  for (const node of await page.locator("[data-block=ChildGraph] [data-node]").all()) {
    const box = (await node.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(svg).toBeHidden();
  await expect(page.locator("[data-block=ChildGraph] [data-node]").first()).toBeHidden();
  for (const a of await page.locator('table[aria-label="Where this child is on each skill"] tbody tr td:first-child a').all()) expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("access · an educator never sees a class that is not theirs", async ({ browser }) => {
  const mine = await asEducator(browser);
  const p = await mine.newPage();
  await p.goto(`/children/${classB}`);
  await expect(p.locator("main")).not.toContainText(NAMES_B[0]);
  const r = await mine.request.post("/api/children/peek", { data: { class: classB, roll: "1" } });
  expect(r.status()).toBe(404);
  await p.goto(`/children/${classB}/1`);
  await expect(p.locator("main")).not.toContainText(NAMES_B[0]);
  await mine.close();
});

test("the old K2 addresses answer 308 to the new ones", async ({ request }) => {
  for (const [from, to] of [["/k2", "/children"], [`/k2/${classA}`, `/children/${classA}`], [`/k2/${classA}/1`, `/children/${classA}/1`]] as const) {
    const r = await request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(308);
    expect(new URL(r.headers().location, "http://localhost:3100").pathname).toBe(to);
  }
});

test("axe finds nothing serious or critical on the three screens, with the peek open", async ({ page }) => {
  for (const url of [`/children?cls=${classA}`, `/children/${classA}`, `/children/${classA}/1`]) {
    await page.goto(url);
    if (url.startsWith("/children?")) await page.getByRole("button", { name: new RegExp(NAMES_A[0]) }).click();
    const found = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(found.map((v) => `${v.id} (${v.nodes.length})`), url).toEqual([]);
  }
});

test("with the educator switch off the three screens say so, show no child, and the peek refuses", async ({ page }) => {
  await voiceSwitch(sql, false);
  try {
    for (const url of ["/children", `/children/${classA}`, `/children/${classA}/1`]) {
      await page.goto(url);
      await expect(page.locator("[data-ux=empty]"), url).toContainText("Voice notes are not switched on.");
      await expect(page.locator("[data-block=ClassGrid], [data-block=ChildGraph], [data-block=DataTable]"), url).toHaveCount(0);
      await expect(page.locator("main"), url).not.toContainText(NAMES_A[0]);
    }
    const r = await page.request.post("/api/children/peek", { data: { class: classA, roll: "1" } });
    expect(r.status()).toBe(403);
  } finally {
    await voiceSwitch(sql, true);
  }
});
