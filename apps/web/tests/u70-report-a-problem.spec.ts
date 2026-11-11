/**
 * U70 — "Report a problem or suggest something", the whole flow against the run's own GitHub (tests/github-server.ts),
 * never the real one (goals/feed_report_from_the_tool.yaml). Nimish, 27 Oct 2026: "one can raise a feature request or
 * file a bug, and that directly reaches you as an issue, and then we decide to work on it."
 */
import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { changeIssue, githubDown, githubUp, issuesMade } from "./github-server";
import { aSetting } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const LIMIT = "feedback.max_per_hour";
let putBack = async () => {};

// A note is kept for good (no row is ever removed), so a run lifts the hourly limit for itself and puts it back.
test.beforeAll(async () => {
  putBack = await aSetting(sql, LIMIT, 1000);
});
test.afterAll(async () => {
  githubUp();
  await putBack();
  await sql.end();
});

const mark = () => `marker${randomBytes(4).toString("hex")}`;

async function write(page: Page, happened: string) {
  await page.getByLabel("What happened, or what you would like").fill(happened);
  await page.getByRole("button", { name: "Send" }).click();
}

const noteOf = async (m: string) =>
  (await sql<{ status: string; issue_number: number | null; route: string; role: string }[]>`
    select status, issue_number, route, role from staff_note where happened like ${`%${m}%`}`)[0];

const issuesWith = (m: string) => issuesMade().filter((i) => i.body.includes(m));

test("the report button is on the top bar of every signed-in page", async ({ page }) => {
  for (const at of ["/today", "/papers", "/growth"]) {
    await page.goto(at);
    await expect(page.locator("[data-frame]").getByRole("link", { name: "Report a problem or suggest something" })).toBeVisible();
  }
  await page.locator("[data-frame]").getByRole("link", { name: "Report a problem or suggest something" }).click();
  await expect(page).toHaveURL(/\/feedback\?from=%2Fgrowth/);
  await expect(page.getByRole("heading", { name: "Report a problem or suggest something" })).toBeVisible();
  await expect(page.getByText("Please do not type a child's name, a parent's name or a phone number here.")).toBeVisible();
});

test("a phone number is refused, then the note is saved, the person is thanked, and GitHub gets exactly one issue", async ({ page }) => {
  const m = mark();
  await page.goto("/feedback?from=%2Fgrowth%2F3f2a9c1e-0000-4000-8000-000000000000%3Ftab%3Dx");
  await write(page, `Nothing came out ${m}. Call me on 98765 43210`);
  await expect(page.getByRole("status")).toHaveText("That looks like a name or a phone number; please take it out");
  // the words stay, so the person only takes the number out
  await expect(page.getByLabel("What happened, or what you would like")).toHaveValue(/98765 43210/);
  expect(await noteOf(m)).toBeUndefined();
  await page.getByLabel("What happened, or what you would like").fill(`Nothing came out ${m}.`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toHaveText("Thanks, it reached the team.");

  const saved = await noteOf(m);
  expect(saved.route).toBe("/growth/[id]");
  expect(saved.role).toBe("coordinator");
  await expect.poll(() => issuesWith(m).length).toBe(1);
  const [issue] = issuesWith(m);
  expect(issue.labels.sort()).toEqual(["from-the-tool", "question"]);
  expect(issue.title).toBe(`Nothing came out ${m}.`);
  expect(issue.body).toContain("a coordinator");
  expect(issue.body).not.toMatch(/e2e@cornerstone\.test|End-to-end test|[^\s@]+@[^\s@]+\.[a-z]{2,}/);
  await expect.poll(async () => (await noteOf(m)).status).toBe("sent");
  expect((await noteOf(m)).issue_number).toBe(issue.number);
});

test("a note GitHub refused is kept, the person is thanked, and it is sent on the next try", async ({ page }) => {
  const m = mark();
  githubDown();
  await page.goto("/feedback?from=%2Fpapers");
  await write(page, `The approve button did nothing ${m}`);
  await expect(page.getByRole("status")).toHaveText("Thanks, it reached the team.");
  await expect.poll(async () => (await noteOf(m))?.status).toBe("failed");
  expect(issuesWith(m)).toHaveLength(0);
  githubUp();
  // a try holds its note for a minute, so two at once never make two issues; this one is long over
  await sql`update staff_note set tried_at = now() - interval '2 minutes' where happened like ${`%${m}%`}`;
  await page.goto("/feedback");
  await expect.poll(async () => (await noteOf(m)).status).toBe("sent");
  expect(issuesWith(m)).toHaveLength(1);
  expect(issuesWith(m)[0].labels.sort()).toEqual(["from-the-tool", "question"]);
});

test("your reports say received, taken up and done from the issue", async ({ page }) => {
  const m = mark();
  await page.goto("/feedback");
  await write(page, `Can the class list sort by roll number ${m}`);
  await expect.poll(async () => (await noteOf(m))?.status).toBe("sent");
  const number = (await noteOf(m)).issue_number!;
  const row = () => page.getByRole("row").filter({ hasText: m });
  await page.goto("/feedback");
  await expect(row()).toHaveAttribute("data-report", "received");
  changeIssue(number, { labels: ["from-the-tool", "question", "scope-locked"] });
  await page.goto("/feedback");
  await expect(row()).toHaveAttribute("data-report", "takenUp");
  await expect(row().getByText("taken up")).toBeVisible();
  changeIssue(number, { state: "closed" });
  await page.goto("/feedback");
  await expect(row()).toHaveAttribute("data-report", "done");
});

test("past the hourly limit a note is refused in words", async ({ page }) => {
  const m = mark();
  await page.goto("/feedback");
  await write(page, `The first one ${m}`);
  await expect(page.getByRole("status")).toHaveText("Thanks, it reached the team.");
  // one note an hour, and this person has just sent one, so the next is one too many
  const lifted = await aSetting(sql, LIMIT, 1);
  try {
    await write(page, `One more ${m}`);
    await expect(page.getByRole("status")).toHaveText(/You have sent 1 notes in the last hour/);
    expect(await sql`select 1 from staff_note where happened = ${`One more ${m}`}`).toHaveLength(0);
  } finally {
    await lifted();
  }
});

test("a signed-out request cannot send a note", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/feedback");
  await expect(page).toHaveURL(/\/login/);
  const m = mark();
  const res = await context.request.post("/feedback", { form: { what: m }, maxRedirects: 0 });
  expect([303, 307, 308, 401]).toContain(res.status());
  expect(await noteOf(m)).toBeUndefined();
  await context.close();
});
