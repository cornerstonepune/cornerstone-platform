import type { FCell, FRow, FSlot } from "@/components/fortnight-grid";
import { shortDate } from "./educator/clock";
import type { Week } from "./educator/types";
import { chipOf } from "./educator/chip";
import { whenIs } from "./educator/clock";
import { isLesson } from "./educator/period";
import { subjectLook, type Clash, type Looks, type Move } from "./timetable-ui";

/** The fortnight grid for one class from the engine's weeks (the sessions as they stand): days across, periods down. A cell
 *  is a moved one when the session is marked moved, a clash one when an unaccepted clash names its class, day and period.
 *  The cells are the session rows for the days shown, one for one; a period fixed on every day shown is a full-width band. */
/** A row's time: the range, then the period's label only when it says something else (a K2 label is itself the range). */
export function timeOf(start: string, end: string | null, label: string) {
  const range = `${start.slice(0, 5)}${end ? `–${end.slice(0, 5)}` : ""}`;
  const digits = (t: string) => t.replace(/\D/g, "");
  return digits(label) === digits(range) || digits(label) === digits(start.slice(0, 5)) ? range : `${range} ${label}`;
}

export function gridOf(weeks: readonly Week[], show: {
    days?: readonly string[];
    looks: Looks;
    clashes: readonly Clash[];
    /** where a click on a lesson goes: the page of its activity (called only for a lesson that has one; a lesson with none is not a link) */
    open?: (day: string, periodId: string) => string;
    /** the page's detail panel (page charter A2): every lesson's block opens its lesson there, whether it has an activity or not; the open
     *  one is marked. Given this, `open` and `pick` are not drawn on the blocks (the coordinator's Move is in the panel). */
    select?: (day: string, periodId: string) => { href: string; key: string; selected: boolean } | undefined;
    /** the coordinator's click on a lesson or a free slot: choosing it as the lesson to move, or as the place to move it to (none for an educator) */
    pick?: (day: string, periodId: string) => string;
    /** the lesson chosen to move, if any: its block is marked, and every free slot then offers itself as a place to move it to */
    picked?: { day: string; periodId: string } | null;
    /** the school's today and now: a period running now is Do now, one recorded is Done, one not recorded and over is Late, none ahead has a chip */
    at?: { today: string; now: string };
  }) {
  const days = weeks.flatMap((w) => w.days).filter((d) => !show.days || show.days.includes(d.day));
  const starts = [...new Set(days.flatMap((d) => d.periods.map((p) => p.starts_at)))].sort();
  const classId = weeks[0]?.class.id ?? "";
  const open = show.clashes.filter((c) => !c.accepted);
  const clashAt = (day: string, period: string) => open.find((c) => c.places.some((p) => p.class === classId && p.date === day && p.period === period));
  const placed: { day: string; periodId: string; cell: FCell }[] = [];
  // a block opens the page's panel when the page has one, else its lesson page (with an activity) and the coordinator's pick
  const selectOrOpen = (day: string, p: { period_id: string; activity: unknown }): Pick<FCell, "href" | "pick" | "openKey" | "selected"> => {
    if (show.select) {
      const o = show.select(day, p.period_id);
      return o ? { href: o.href, openKey: o.key, selected: o.selected } : {};
    }
    return { href: p.activity && show.open ? show.open(day, p.period_id) : undefined, pick: show.pick?.(day, p.period_id) };
  };
  const rows: FRow[] = starts.map((start) => {
    const at = days.map((d) => d.periods.find((p) => p.starts_at === start) ?? null);
    const label = at.find((p) => p)?.label ?? start;
    // a fixed part of the day is a band whether or not a session row was loaded for it (the engine gives it as `empty` when none was)
    if (at.length && at.every((p) => p === null || p.fixed || p.kind === "fixed")) return { band: `${at.find((p) => p)?.name ?? label} · ${start.slice(0, 5)}` };
    return {
      time: timeOf(start, at.find((p) => p?.ends_at)?.ends_at ?? null, label),
      cells: at.map((p, i): FCell | FSlot | null => {
        if (!p) return null;
        // a lesson period with no lesson that day is a place to move the chosen lesson to
        if (!isLesson(p) && p.kind === "empty" && !p.fixed && show.picked && show.pick) return { slot: show.pick(days[i].day, p.period_id), label: "Move it here" };
        if (!isLesson(p)) return null;
        const clash = clashAt(days[i].day, p.period_id);
        const chip = show.at ? chipOf(p, { now: show.at.now, day: whenIs(days[i].day, show.at.today) }) : null;
        const cell: FCell = {
          subject: subjectLook(show.looks, p.subject),
          activity: p.name,
          ...selectOrOpen(days[i].day, p),
          picked: show.picked ? show.picked.day === days[i].day && show.picked.periodId === p.period_id : undefined,
          moved: p.state === "moved",
          clash: clash !== undefined,
          note: clash?.detail,
          chip: chip === "doNow" || chip === "done" || chip === "late" ? chip : undefined,
          now: chip === "doNow",
        };
        placed.push({ day: days[i].day, periodId: p.period_id, cell });
        return cell;
      }),
    };
  });
  const holidays = days.filter((d) => d.kind === "holiday").map((d) => ({ day: d.day, words: d.note ? `Holiday: ${d.note}` : "Holiday" }));
  return { days: days.map((d) => d.day), labels: days.map((d) => shortDate(d.day)), rows, holidays, placed };
}

/** The cells a grid draws, counted (a test and the page's own words use the same count). */
export const cellsIn = (rows: readonly FRow[]) => rows.flatMap((r) => ("cells" in r ? r.cells.filter((c) => c !== null) : [])).length;

/** The moves that put a lesson where the grid now shows it: by day and period, the latest move to that place. */
export const moveInto = (moves: readonly Move[], day: string, periodId: string) => moves.find((m) => m.to === `${day} ${periodId}`);

