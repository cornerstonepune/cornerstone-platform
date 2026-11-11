import type { FCell, FRow } from "@/components/fortnight-grid";
import { shortDate } from "./educator/clock";
import type { Week } from "./educator/types";
import { isLesson } from "./educator/period";
import { subjectLook, type Clash, type Looks, type Move } from "./timetable-ui";

/** The fortnight grid for one class from the engine's weeks (the sessions as they stand): days across, periods down. A cell
 *  is a moved one when the session is marked moved, a clash one when an unaccepted clash names its class, day and period.
 *  The cells are the session rows for the days shown, one for one; a period fixed on every day shown is a full-width band. */
export function gridOf(weeks: readonly Week[], show: { days?: readonly string[]; looks: Looks; clashes: readonly Clash[]; href: (day: string, periodId: string) => string }) {
  const days = weeks.flatMap((w) => w.days).filter((d) => !show.days || show.days.includes(d.day));
  const starts = [...new Set(days.flatMap((d) => d.periods.map((p) => p.starts_at)))].sort();
  const classId = weeks[0]?.class.id ?? "";
  const open = show.clashes.filter((c) => !c.accepted);
  const clashAt = (day: string, period: string) => open.some((c) => c.places.some((p) => p.class === classId && p.date === day && p.period === period));
  const rows: FRow[] = starts.map((start) => {
    const at = days.map((d) => d.periods.find((p) => p.starts_at === start) ?? null);
    const label = at.find((p) => p)?.label ?? start;
    if (at.length && at.every((p) => p === null || p.kind === "fixed")) return { band: at.find((p) => p)?.name ?? label };
    return {
      time: `${start.slice(0, 5)} ${label}`,
      cells: at.map((p, i): FCell | null =>
        p && isLesson(p)
          ? {
              subject: subjectLook(show.looks, p.subject),
              activity: p.name,
              href: show.href(days[i].day, p.period_id),
              moved: p.state === "moved",
              clash: clashAt(days[i].day, p.period_id),
            }
          : null,
      ),
    };
  });
  return { days: days.map((d) => d.day), labels: days.map((d) => shortDate(d.day)), rows };
}

/** The cells a grid draws, counted (a test and the page's own words use the same count). */
export const cellsIn = (rows: readonly FRow[]) => rows.flatMap((r) => ("cells" in r ? r.cells.filter((c) => c !== null) : [])).length;

/** The moves that put a lesson where the grid now shows it: by day and period, the latest move to that place. */
export const moveInto = (moves: readonly Move[], day: string, periodId: string) => moves.find((m) => m.to === `${day} ${periodId}`);
