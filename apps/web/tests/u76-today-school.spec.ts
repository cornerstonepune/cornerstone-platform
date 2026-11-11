/**
 * U76 (UI-7, the school's rows) — how the school's Today lays out CP-28's counts. The rules are functions (the same code the page runs);
 * the route itself (POST /k2/today-school, backend #619) is tested in the engine.
 */
import { expect, test } from "@playwright/test";
import { classLabel, heat, readiness, tiles, waiting, type Cell, type School } from "../lib/today-school";

const school = (over: Partial<School> = {}): School => ({
  clashes: 2,
  drafts: { count: 1, rows: [{ fortnight: 11, grade: "K2", section: "K2 A" }] },
  late_notes: 3,
  materials_no_quantity: { count: 4, rows: [{ grade: "K2", lines: 4 }] },
  last_week: { cells: [], sessions_done: 118, sessions_planned: 131 },
  next_week: { from: "2026-11-23", new_activities: [] },
  ready: { children: 100, children_with_consent: 90, activities: 800, activities_ready: 500, materials: 300, materials_with_quantity: 250 },
  ...over,
});
const cell = (grade: string, section: string, day: string, state: Cell["state"]): Cell => ({ grade, section, day, state });

test("the tiles' numbers are the counts behind them: do now = clashes + late notes, this week = drafts + materials lines, done = lessons done of planned", () => {
  const s = school();
  expect(tiles(s)).toEqual({ doNow: 5, soon: 5, done: 118, planned: 131 });
  const rows = Object.fromEntries(waiting(s).map((w) => [w.key, w.n]));
  expect(rows.clash + rows.late).toBe(tiles(s).doNow);
  expect(rows.draft + rows.materials).toBe(tiles(s).soon);
  expect(rows.undone).toBe(131 - 118);
});

test("a row appears only when something waits, red first, and a day with nothing waiting has no row", () => {
  expect(waiting(school({ clashes: 0, late_notes: 0, drafts: { count: 0, rows: [] }, materials_no_quantity: { count: 0, rows: [] }, last_week: { cells: [], sessions_done: 5, sessions_planned: 5 } }))).toEqual([]);
  expect(waiting(school()).map((w) => w.key)).toEqual(["clash", "late", "draft", "undone", "materials"]);
  expect(waiting(school({ clashes: 1 })).find((w) => w.key === "clash")!.many).toBe("1 clash");
});

test("the heat grid has one cell per class per day, a holiday is its own cell, and classes keep the order the school lists them in", () => {
  const cells = [
    cell("K1", "K1 B", "2026-11-16", "done"), cell("K1", "K1 B", "2026-11-17", "holiday"), cell("K1", "K1 B", "2026-11-18", "not_done"),
    cell("K2", "K2 A", "2026-11-16", "moved"), cell("K2", "K2 A", "2026-11-17", "holiday"), cell("K2", "K2 A", "2026-11-18", "none"),
  ];
  const g = heat(cells);
  expect(g.days).toHaveLength(3);
  expect(g.rows.map((r) => r.label)).toEqual(["K1 B", "K2 A"]);
  for (const r of g.rows) expect(r.cells).toHaveLength(g.days.length);
  expect(g.rows[0].cells).toEqual(["done", "holiday", "notDone"]);
  expect(g.rows[1].cells[1]).toBe("holiday");
});

test("no class is ordered by how it did: a worse class stays where the school lists it", () => {
  const g = heat([cell("G1", "G1 A", "2026-11-16", "not_done"), cell("G1", "G1 B", "2026-11-16", "done")]);
  expect(g.rows.map((r) => r.label)).toEqual(["G1 A", "G1 B"]);
});

test("a class is said as the school says it, and readiness is pairs of counts", () => {
  expect(classLabel({ grade: "K2", section: "A" })).toBe("K2 A");
  expect(classLabel({ grade: "K2", section: "K2 A" })).toBe("K2 A");
  expect(classLabel({ grade: "G1", section: null })).toBe("G1");
  expect(readiness(school().ready).map((r) => [r.have, r.of])).toEqual([[90, 100], [500, 800], [250, 300]]);
});

test("a heat-grid cell opens its class's day when the class is known, and a day with no cell has no link", () => {
  const cells = [cell("K2", "K2 A", "2026-11-16", "done"), cell("K2", "K2 A", "2026-11-18", "not_done"), cell("K1", "K1 B", "2026-11-16", "done")];
  const g = heat(cells, (c) => (c.grade === "K2" ? `/timetable?class=${c.section}&view=day&day=${c.day}` : null));
  expect(g.rows.map((r) => r.label)).toEqual(["K2 A", "K1 B"]);
  expect(g.rows[0].hrefs).toEqual(["/timetable?class=K2 A&view=day&day=2026-11-16", "/timetable?class=K2 A&view=day&day=2026-11-18"]);
  expect(g.rows[1].hrefs).toEqual([null, null]);
  expect(heat(cells).rows[0].hrefs).toBeUndefined();
});
