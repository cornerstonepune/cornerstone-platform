/**
 * U76 (UI-3b, UI-3g) — Children as the wireframe has it, and the notes: a child's notes waiting, the school's window for needing attention,
 * the table grouped by how they are doing, the whole-class card and the Needing attention card. The world is tests/children-world.ts.
 * 14 Nov 2026 (Nimish: "this space on the right is not useful … the table is getting cut"): no right column; the numbers are a band above
 * the table, the cards and the latest notes sit under it, the peek is a sheet over the page, and the table never scrolls sideways at 1440.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TABLE_ROW_LIMIT } from "../lib/ux-rules";
import { NAMES_A, asEducator, childrenWorld, rowsOf } from "./children-world";
import { aK2Note } from "./k2-rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let classA = "";
let tenant = "";
let staff = "";
let skills: { code: string; name: string }[] = [];

test.beforeAll(async () => {
  ({ classA, tenant, staff, skills } = await childrenWorld(sql));
});
test.afterAll(async () => {
  await sql.end();
});

test("notes waiting: the engine's count for a child, none where nothing waits, and no placeholder where the person has no count", async ({ browser, page }) => {
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, 'ACT-U72-912', 'K2', 'Maths', 'Counting in tens', '912') on conflict (tenant_id, code) do nothing`;
  for (const k of skills) await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, 'ACT-U72-912', ${k.code}) on conflict do nothing`;
  const note = await aK2Note(sql, { klass: classA, staff }, "Activity 912. Above 2.", "drafted");
  try {
    const mine = await asEducator(browser);
    const p = await mine.newPage();
    await p.goto(`/children?cls=${classA}`);
    const row = (n: string) => p.locator("tbody tr").filter({ has: p.getByRole("button", { name: new RegExp(n) }) });
    await expect(row(NAMES_A[1])).toContainText("1 to confirm");
    await expect(row(NAMES_A[0])).toContainText("none");
    // and the rail (the wireframe's): the count to confirm beside Notes, and the latest notes with who they name and how they came
    await expect(p.locator("[data-notes-count]")).toContainText("Notes · 1 to confirm");
    await expect(p.locator("[data-latest-notes]")).toContainText(NAMES_A[1]);
    await expect(p.locator("[data-latest-notes]")).toContainText("to confirm");
    await expect(p.locator("[data-latest-notes]")).toContainText(/By (voice|form)/);
    await mine.close();
    // the coordinator holds no class, so the engine will not count another person's notes: no count and no placeholder, never a guess
    await page.goto(`/children?cls=${classA}`);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Notes waiting" })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("not available");
  } finally {
    await sql`update pii.educator_note set status = 'left_unconfirmed' where id = ${note}::uuid`;
  }
});

test("a child not seen for the school's window needs attention, by the setting and never by a number in the code", async ({ page }) => {
  const [was] = await sql<{ value: unknown }[]>`select value from config where key = 'children.attention_days'`;
  try {
    await sql`update config set value = '1'::jsonb where key = 'children.attention_days'`;
    await page.goto(`/children?cls=${classA}&show=attention`);
    const withOne = await page.locator("tbody tr[data-child]").count();
    await sql`update config set value = '100000'::jsonb where key = 'children.attention_days'`;
    await page.goto(`/children?cls=${classA}&show=attention`);
    const withMany = await page.locator("tbody tr[data-child]").count();
    expect(withOne).toBeGreaterThan(withMany); // a shorter window flags more children
  } finally {
    await sql`update config set value = ${sql.json(was.value as never)} where key = 'children.attention_days'`;
  }
});

test("wireframe · grouped by how they are doing by default, tinted by the group's state; None is one table", async ({ page }) => {
  await page.goto(`/children?cls=${classA}`);
  const groups = page.locator("[data-group]");
  expect(await groups.count()).toBeGreaterThan(1);
  // a group's heading carries its count; the counts sum to the children; a group is tinted by its state
  const counts = await page.locator(".b-grp-h [data-count]").allInnerTexts();
  expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(NAMES_A.length);
  for (const g of await groups.all()) expect(["ok", "wait", "unseen"]).toContain(await g.getAttribute("data-state"));
  await expect(page.getByText("Grouped by how they are doing.")).toBeVisible();
  await expect(page.getByLabel("Group by")).toHaveValue("doing");
  await page.goto(`/children?cls=${classA}&group=none`);
  await expect(page.locator("[data-group]")).toHaveCount(1);
  await expect(page.locator(".b-grp-h [data-count]")).toHaveCount(0);
  await expect(rowsOf(page)).toHaveCount(Math.min(NAMES_A.length, TABLE_ROW_LIMIT));
});

test("wireframe · the whole-class card is the sum of the rows, and Needing attention names the children not seen for two weeks", async ({ page }) => {
  const sum = { secure: 0, practising: 0, unseen: 0 };
  // the rows are paged; the card is the whole class, so the rows of every page are summed
  for (const at of [`/children?cls=${classA}&group=none`, `/children?cls=${classA}&group=none&page=2`]) {
    await page.goto(at);
    for (const d of await page.locator("[data-doing]").evaluateAll((els) => els.map((e) => e.getAttribute("data-doing")!))) {
      const [a, b, c] = d.split("/").map(Number);
      sum.secure += a;
      sum.practising += b;
      sum.unseen += c;
    }
  }
  await page.goto(`/children?cls=${classA}&group=none`);
  const card = page.locator(".b-card", { hasText: "The whole class, all skills" });
  await expect(card.getByRole("img")).toHaveAttribute("aria-label", new RegExp(`${sum.secure} secure.*${sum.practising} practising.*${sum.unseen} not seen yet`));
  // no red segment, no score: whole counts
  await expect(card).not.toContainText(/%|rank|score/i);
  const attention = page.locator(".b-card", { hasText: "Needing attention" });
  const n = Number((await attention.locator(".b-card-h").innerText()).match(/(\d+)/)![1]);
  const listed = await attention.locator("[data-attention-list] li").count();
  expect(listed).toBe(Math.min(n, 12));
  await page.goto(`/children?cls=${classA}&group=attention&show=attention`);
  await expect(page.locator(".b-grp-h [data-count]").first()).toHaveText(String(n));
});

test("no right column: the table takes the width and is never cut at 1440 px, the numbers are a band above it, and the peek is a sheet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/children?cls=${classA}&group=none`);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("[data-rail]")).toHaveCount(0);
  const band = page.locator("[data-block=DetailPanel][data-panel=summary]");
  await expect(band.locator("[data-stat=children]")).toBeVisible();
  await expect(band.locator("[data-stat=attention]")).toBeVisible();
  // every column shows: the table's box does not scroll sideways
  const cut = await page.locator(".data-table").first().evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(cut).toBeLessThanOrEqual(1);
  await expect(page.getByRole("columnheader", { name: "Absences noted" })).toBeInViewport();
  // the latest notes and the page's links are a card under the table
  await expect(page.locator("[data-panel-more] [data-latest-notes] [data-page-links]")).toContainText("Assessments");
  // a name opens the peek as a sheet over the page; Close takes it away
  await page.getByRole("button", { name: new RegExp(NAMES_A[0]) }).first().click();
  await expect(page.locator("[data-peek-sheet] [data-block=ChildPeek]")).toBeVisible();
  await page.locator("[data-peek-sheet]").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("[data-peek-sheet]")).toHaveCount(0);
});
