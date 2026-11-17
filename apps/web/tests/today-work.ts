import type { Locator, Page } from "@playwright/test";

// What needs doing, on My day (CP-69; the old Today's "waiting on you" rows are now the board's cards under [data-my-tasks]). One card for
// each kind of work and class (`[data-kcard][data-card-kind][data-card-class]`, its count in its progress line, "3 papers"), in the lane its
// urgency gives it (`[data-lane=now|week|ready]`; `done` holds what was finished). A card opens the work on the right
// (`?open=wait:<kind>~<class>`; `?open=wait:group-<key>` still opens a whole group), one table row each (`tr[data-kind]`, ten to a page).
// The filters are the page's: subject, class, group (What), and `kind`.

/** The group a kind of task is listed under (lib/todo.ts TODO_GROUPS). Skills to approve are not on My day (specs/UI-7 #3). */
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

/** The kinds of task a group holds. */
export const KINDS_OF = (group: string): string[] => Object.entries(GROUP_OF).filter(([, g]) => g === group).map(([k]) => k);

/** My day with one kind of task opened on the right, as the old page's `?kind=` showed it; `more` adds filters ("&class=2A", "&page=2"). */
export const workAt = (kind: string, more = "") => `/my-day?kind=${kind}&open=wait:group-${GROUP_OF[kind]}${more}`;

/** The right side's panel. */
export const panel = (page: Page): Locator => page.locator("[data-block=DetailPanel]");

/** The cards of waiting work (every lane but Done) of a group of kinds; of every kind with none given. */
export const workCards = (page: Page, group?: string): Locator => {
  const lanes = "[data-my-tasks] [data-lane]:not([data-lane=done]) [data-kcard]";
  if (!group) return page.locator(lanes);
  return page.locator(KINDS_OF(group).map((k) => `${lanes}[data-card-kind="${k}"]`).join(", "));
};

/** A group of work's cards on My day's board (one for each kind and class). */
export const workRow = (page: Page, group: string): Locator => workCards(page, group);

/** The number a group of work holds: what the group's own panel says when it is open (`workAt`; its count is of tasks, never of a card's
 *  class), else what its cards say together ("3 papers" and "2 papers" → 5); 0 when none is there. */
export async function rowCount(page: Page, group: string): Promise<number> {
  const line = panel(page).locator("[data-panel-line]");
  if (await line.count()) return Number((await line.innerText()).replace(/\D/g, "") || 0);
  const says = await workRow(page, group).locator(".b-progress").allInnerTexts();
  return says.reduce((n, t) => n + Number(t.replace(/\D/g, "") || 0), 0);
}

/** Every task on My day at `url` (its filters kept), as {kind, state, where}: each card of waiting work opened in turn, the first page of each. */
export async function allTasks(page: Page, url = "/my-day"): Promise<{ kind: string; state: string; where: string }[]> {
  await page.goto(url);
  await page.locator("[data-my-tasks]").waitFor();
  const hrefs = await workCards(page).evaluateAll((cards) => cards.map((c) => c.getAttribute("href")!));
  const out: { kind: string; state: string; where: string }[] = [];
  for (const href of hrefs) {
    await page.goto(href);
    await panel(page).locator("[data-panel-line]").waitFor();
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
