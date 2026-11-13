import type { Locator, Page } from "@playwright/test";

// What needs doing, on Today (page charter Part C: "merge into Today (coordinator): it is the waiting-on-you list"; its old address answers
// 308 to /today). The specs that drove the old page read the same work here: a kind of work is a "waiting on you" row
// (`[data-row=group-<key>]`, its count in `[data-many]`), and its tasks are the row opened on the right (`?open=wait:group-<key>`), one table
// row each (`tr[data-kind]`, ten to a page). The filters are the old page's: subject, class, group (What), and the old `kind`.

/** The group a kind of task is listed under (lib/todo.ts TODO_GROUPS). Skills to approve are not on Today (specs/UI-7 #3). */
export const GROUP_OF: Record<string, string> = {
  record: "record",
  note: "notes",
  ask: "asks",
  taught: "taught",
  generate: "generate",
  classpaper: "classpapers",
  empty: "scans",
  check: "answers",
  signoff: "answers",
  home: "home",
  report: "reports",
};

/** Today with one kind of task opened on the right, as the old page's `?kind=` showed it; `more` adds filters ("&class=2A", "&page=2"). */
export const workAt = (kind: string, more = "") => `/today?kind=${kind}&open=wait:group-${GROUP_OF[kind]}${more}`;

/** The right side's panel. */
export const panel = (page: Page): Locator => page.locator("[data-block=DetailPanel]");

/** A kind of work's row on Today's "waiting on you" list. */
export const workRow = (page: Page, group: string): Locator => page.locator(`[data-waiting] [data-row="group-${group}"]`);

/** The number a row's count says ("3 papers" → 3); 0 when the row is not there. */
export async function rowCount(page: Page, group: string): Promise<number> {
  const many = workRow(page, group).locator("[data-many]");
  return (await many.count()) ? Number((await many.innerText()).replace(/\D/g, "")) : 0;
}

/** Every task on Today at `url` (its filters kept), as {kind, state, where}: each kind of work's row opened in turn, the first page of each. */
export async function allTasks(page: Page, url = "/today"): Promise<{ kind: string; state: string; where: string }[]> {
  await page.goto(url);
  await page.locator("#waiting-h").waitFor();
  const keys = (await page.locator("[data-waiting] [data-row^='group-']").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-row")!)));
  const out: { kind: string; state: string; where: string }[] = [];
  for (const key of keys) {
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}open=wait:${key}`);
    out.push(
      ...(await panel(page)
        .locator("tr[data-kind]")
        .evaluateAll((trs) =>
          trs.map((tr) => ({
            kind: tr.getAttribute("data-kind")!,
            state: tr.getAttribute("data-state")!,
            where: (tr.querySelector("td[data-label=Where]") as HTMLElement | null)?.innerText.trim() ?? "",
          })),
        )),
    );
  }
  return out;
}
