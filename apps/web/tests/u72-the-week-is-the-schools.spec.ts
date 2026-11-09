/**
 * CP-24 (audit F5): the ISO week of a page is the school's, not the server's. No browser, no database: at 01:00 on a Monday in
 * Pune it is still Sunday night in UTC, and the week must be that Monday's.
 */
import { expect, test } from "@playwright/test";
import { dayIn } from "../lib/school-clock";
import { isoWeek } from "../lib/week";

const ZONE = "Asia/Kolkata"; // the test school's `school.time_zone`
const MONDAY_0100_IST = new Date("2026-11-08T19:30:00Z"); // Sunday 19:30 UTC

test("01:00 on a Monday in Pune is that Monday's week, not the week before", () => {
  expect(dayIn(ZONE, MONDAY_0100_IST)).toBe("2026-11-09");
  expect(isoWeek(dayIn(ZONE, MONDAY_0100_IST))).toBe("2026-W46");
  // the server's UTC date, which isoWeek used to take, was still the Sunday before
  expect(isoWeek(MONDAY_0100_IST)).toBe("2026-W45");
});

test("a day names its ISO week, across a year's end too", () => {
  expect(isoWeek("2026-11-15")).toBe("2026-W46"); // the Sunday closes the week
  expect(isoWeek("2026-12-31")).toBe("2026-W53");
  expect(isoWeek("2027-01-01")).toBe("2026-W53");
  expect(isoWeek("2027-01-04")).toBe("2027-W01");
});
