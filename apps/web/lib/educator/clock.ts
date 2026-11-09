// The school's clock, not the server's (a page drawn at 03:54 in Pune is about that Pune day): the date and HH:MM come
// from lib/school-clock.ts, which reads the school's zone; a page reads them once and passes them down.
export { nowAtSchool } from "../school-clock";
export type When = "past" | "today" | "future";
export const whenIs = (day: string, today: string): When => (day < today ? "past" : day > today ? "future" : "today");

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const at = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** The school day `n` school days (Monday to Friday) from `day`. */
export function schoolDay(day: string, n: number): string {
  let t = at(day);
  for (let left = Math.abs(n); left > 0; ) {
    t += Math.sign(n) * 86_400_000;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return iso(t);
}

/** The Monday of `day`'s week, moved by `weeks`. */
export function mondayOf(day: string, weeks = 0): string {
  const t = at(day);
  const wd = (new Date(t).getUTCDay() + 6) % 7;
  return iso(t - wd * 86_400_000 + weeks * 7 * 86_400_000);
}

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
/** "Monday 23 November", "Mon 23": the school's dates as words. */
export const longDate = (day: string) => LONG.format(at(day));
export const shortDate = (day: string) => SHORT.format(at(day));
