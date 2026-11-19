/**
 * U128 (CP-88, issue #913) — marking the class by tapping the children, then choosing the level: ONE way. A tap on a card picks the child
 * (a tick and the accent's ring, aria-pressed), a tap again lets go; with anyone picked one bar says how many, offers every level and the
 * other marks, and a Clear; a level marks exactly the picked children in one save. The checkbox row and the one-child picker are gone. Held at
 * 1440 px and 400 px (no sideways scroll, controls of 44 px, the bar in view above the phone's tab bar in a class of 22).
 * The class is the spec's own (section U128, grade G8, used by no other spec): 22 children, and an activity whose levels are long sentences,
 * as the school's own are, so the bar is shown with the words that make it hardest to fit.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { k2Class, voiceSwitch, ROLLS } from "./k2-rows";
import { readTokens } from "./tokens-file";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G8";
const ACTIVITY = "U128-ACT-ONE";
// level 2 is left unwritten ("Not written"); the others are long, as the school's rubric lines are
const LEVELS = [
  "U128 level zero: does not yet join in, even when shown how, and needs an adult beside them",
  "U128 level one: joins in with help and counts the objects one by one with an adult",
  "",
  "U128 level three: explains how they know and gives their own example from home or the market",
];
const WIDTHS = [1440, 400] as const;
const T = readTokens();
const SIZES = [...new Set(["--text-caption", "--text-body", "--text-title-page"].map((k) => parseFloat(T[k])))];
const lessons: Record<number, string> = {};
let wasTimetable = false;

const section = (page: Page) => page.locator("[data-child-levels]");
const card = (page: Page, roll: string) => section(page).locator(`[data-roll="${roll}"]`);
const bar = (page: Page) => section(page).locator("[data-level-picker]");
const opened = async (page: Page, width: number) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
  await page.goto(`/period/${lessons[width]}`);
  await expect(section(page).locator("[data-roll]")).toHaveCount(ROLLS.length);
};

test.beforeAll(async () => {
  // the class is moved off K2 once it is made, so a second run finds it by its grade, not by making it again
  const [had] = await sql<{ id: string }[]>`select id from school_class where section = 'U128' and grade_code = ${GRADE} limit 1`;
  let klass = had?.id ?? "";
  if (!klass) {
    ({ klass } = await k2Class(sql, "U128"));
    await sql`update school_class set grade_code = ${GRADE} where id = ${klass}`;
  }
  const [{ tenant, campus, today }] = await sql<{ tenant: string; campus: string; today: string }[]>`
    select c.tenant_id as tenant, c.campus_id as campus, (now() at time zone 'Asia/Kolkata')::date::text as today from school_class c where c.id = ${klass}`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${ACTIVITY}, ${GRADE}, 'Maths', 'U128 first activity', '128') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_skill (tenant_id, activity_code, skill_code) select ${tenant}, ${ACTIVITY}, code from registry_skill where tenant_id = ${tenant} order by code limit 2 on conflict do nothing`;
  await sql`
    update activity set objective = 'U128 what it is for', steps = 'U128 first step', materials = 'U128 lay out a bundle',
      level_0 = ${LEVELS[0]}, level_1 = ${LEVELS[1]}, level_2 = ${LEVELS[2]}, level_3 = ${LEVELS[3]}
    where tenant_id = ${tenant} and code = ${ACTIVITY}`;
  const [day] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${today}::date, 'teaching')
    on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
  // a lesson of this run's own for each width (marks are append-only, so a lesson marked by an earlier run stays marked)
  const t = Math.floor(Date.now() / 1000) % 86396;
  const at = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  for (const [i, width] of WIDTHS.entries()) {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${tenant}, ${GRADE}, ${12811 + i}, ${at(t + i)}::time, ${`U128 lesson ${width}`}, false)
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set label = excluded.label returning id`;
    const [s] = await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${klass}, ${day.id}, ${p.id}, 'math', 'subject', 'planned', true, ${`U128 lesson ${width}`}, ${ACTIVITY})
      on conflict (school_class_id, school_day_id, period_id) do update set activity_code = ${ACTIVITY}, text = excluded.text returning id`;
    lessons[width] = s.id;
  }
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
  await timetableSwitch(sql, true);
  await voiceSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasTimetable);
  await voiceSwitch(sql, false);
  await sql.end();
});

for (const width of WIDTHS) {
  test(`1. at ${width} px a tap picks a child, a tap again lets go; a level marks exactly the picked children; Clear empties; no checkbox row`, async ({ page }) => {
    await opened(page, width);
    // one way only: no row of checkboxes, no "Tick several", nothing offered until a child is picked
    await expect(section(page).locator("input[type=checkbox], [data-tick-children]")).toHaveCount(0);
    await expect(section(page)).not.toContainText("Tick several");
    await expect(section(page)).toContainText("Tap the children, then choose the level they showed.");
    await expect(bar(page)).toHaveCount(0);
    for (const roll of ROLLS) await expect(card(page, roll)).toHaveAttribute("aria-pressed", "false");

    // three taps: three ticks, "3 selected"
    for (const roll of ["2", "5", "9"]) await card(page, roll).click();
    for (const roll of ["2", "5", "9"]) {
      await expect(card(page, roll)).toHaveAttribute("aria-pressed", "true");
      await expect(card(page, roll).locator(".b-check")).toBeVisible();
    }
    await expect(card(page, "3")).toHaveAttribute("aria-pressed", "false");
    await expect(section(page).locator(".b-check")).toHaveCount(3);
    await expect(bar(page)).toHaveCount(1);
    await expect(bar(page).locator("[data-selected-count]")).toHaveText("3 selected");
    // every level in the activity's words, "Not written" for the unwritten one, and the two other marks
    const choices = bar(page).locator("[data-choose-level]");
    await expect(choices).toHaveCount(6);
    await expect(choices.nth(2)).toHaveText(/^\s*2\s*Not written\s*$/);
    await expect(choices.nth(4)).toHaveText("Absent");
    await expect(choices.nth(5)).toHaveText("Not willing");

    // one tapped again: two
    await card(page, "5").click();
    await expect(card(page, "5")).toHaveAttribute("aria-pressed", "false");
    await expect(card(page, "5").locator(".b-check")).toHaveCount(0);
    await expect(bar(page).locator("[data-selected-count]")).toHaveText("2 selected");

    // a level marks exactly those two, in one save, and the selection is cleared
    await bar(page).locator("[data-choose-level='1']").click();
    await expect(section(page).locator("[data-saved]")).toBeVisible();
    await expect(bar(page)).toHaveCount(0);
    await expect(section(page).locator(".b-check")).toHaveCount(0);
    await page.reload();
    await expect(section(page).locator("[data-roll][data-level='1']")).toHaveCount(2);
    for (const roll of ["2", "9"]) await expect(card(page, roll)).toHaveAttribute("data-level", "1");
    await expect(card(page, "5")).not.toHaveAttribute("data-level", "1");

    // Clear lets go of everyone, and the bar goes with them
    await card(page, "3").click();
    await card(page, "4").click();
    await expect(bar(page).locator("[data-selected-count]")).toHaveText("2 selected");
    await bar(page).getByRole("button", { name: "Clear" }).click();
    await expect(bar(page)).toHaveCount(0);
    await expect(section(page).locator("[aria-pressed=true]")).toHaveCount(0);

    // "Select all unmarked" picks every child still to mark, as many as the page says are not marked
    const left = Number(((await section(page).locator("[data-unmarked]").textContent()) ?? "").match(/\d+/)![0]);
    expect(left).toBeGreaterThan(0);
    await section(page).getByRole("button", { name: "Select all unmarked" }).click();
    await expect(bar(page).locator("[data-selected-count]")).toHaveText(`${left} selected`);
  });

  test(`2. at ${width} px the bar fits: in view with a class of ${ROLLS.length}, no sideways scroll, controls of 44 px, the page's three sizes and two weights`, async ({ page }) => {
    await opened(page, width);
    await card(page, ROLLS[0]).click();
    await card(page, ROLLS[1]).click();
    await expect(bar(page).locator("[data-selected-count]")).toHaveText("2 selected");
    const m = await page.evaluate(() => {
      const b = document.querySelector("[data-level-picker]")!.getBoundingClientRect();
      const g = document.querySelector("[data-child-levels] [data-grid]")!.getBoundingClientRect();
      const tabs = document.querySelector("[data-tabbar]");
      const tab = tabs && getComputedStyle(tabs).display !== "none" ? tabs.getBoundingClientRect().top : null;
      return { top: b.top, bottom: b.bottom, right: b.right, left: b.left, gridBottom: g.bottom, inner: window.innerHeight, wide: document.documentElement.scrollWidth - document.documentElement.clientWidth, tab };
    });
    // in view where it stands, though the grid ends below the screen (the bar holds to the foot, never waits at the end of the class)
    expect(m.top).toBeGreaterThanOrEqual(0);
    expect(m.bottom).toBeLessThanOrEqual(m.inner);
    if (width === 400) {
      expect(m.gridBottom, "the class is longer than the screen").toBeGreaterThan(m.inner);
      expect(m.tab, "the phone's tab bar").not.toBeNull();
      expect(m.bottom, "above the tab bar").toBeLessThanOrEqual(m.tab!);
    }
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(width);
    expect(m.wide).toBeLessThanOrEqual(0);
    // every control of the bar, and the select-all button, is 44 px tall; the bar's levels are reachable by a tap
    const small = await page.locator("[data-child-levels] [data-level-picker] button, [data-child-levels] [data-select-unmarked]").evaluateAll((els) =>
      els.map((e) => [e.textContent?.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)] as const).filter(([, h]) => h < 44),
    );
    expect(small).toEqual([]);
    // the page's type: three sizes, two weights, everywhere in the section
    const type = await section(page).evaluate((root) => {
      const seen = new Set<string>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !n.textContent?.trim() || el.closest("svg")) continue;
        const cs = getComputedStyle(el);
        seen.add(`${parseFloat(cs.fontSize)}/${cs.fontWeight}`);
      }
      return [...seen];
    });
    for (const k of type) {
      const [size, weight] = k.split("/").map(Number);
      expect(SIZES, `font size ${k}`).toContain(size);
      expect([400, 600], `font weight ${k}`).toContain(weight);
    }
    // on a phone the bar is where the thumb is wherever the page is scrolled to (a sticky bar cannot rise above its section, a fixed one can)
    if (width === 400) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const at = await bar(page).evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, inner: window.innerHeight, tab: document.querySelector("[data-tabbar]")!.getBoundingClientRect().top };
      });
      expect(at.top).toBeGreaterThanOrEqual(0);
      expect(at.bottom).toBeLessThanOrEqual(at.tab);
    }
    // choosing a level out of the bar still works with the long words (the last control of the bar is reachable)
    await bar(page).locator("[data-choose-level='not_willing']").scrollIntoViewIfNeeded();
    await expect(bar(page).locator("[data-choose-level='not_willing']")).toBeInViewport();
  });
}
