import { chipOf, countdown, nowAt, type Chip } from "@/lib/educator/chip";
import { isLesson, timeOf } from "@/lib/educator/period";
import type { Day, Period } from "@/lib/educator/types";

// FAKE DATA ONLY (ATH-25 trial): an invented class and invented lessons. The clock is fixed so every build shows the same moment.
export const TODAY = "2026-11-09";
export const NOW = "10:42";

const p = (period_id: string, starts_at: string, ends_at: string | null, name: string, kind: Period["kind"], o: Partial<Period> = {}): Period => ({
  period_id, starts_at, ends_at, label: name, name, fixed: kind === "fixed", kind, subject: null, text: "", line: null, state: "planned", activity: null, ...o,
});

export const DAY: Day = {
  classes: [
    { id: "c1", grade: "Grade 1", section: "Neem" },
    { id: "c2", grade: "Grade 1", section: "Bamboo" },
  ],
  class: { id: "c1", grade: "Grade 1", section: "Neem" },
  day: TODAY,
  kind: "teaching",
  note: null,
  week: "A",
  fortnight: { number: 5, starts_on: "2026-11-02", ends_on: "2026-11-13" },
  frozen: false,
  periods: [
    p("p1", "08:30", "08:50", "Assembly", "fixed"),
    p("p2", "08:50", "09:30", "English", "subject", { state: "done", line: "Rhymes and sounds", activity: { id: "a1", code: "ENG.01", name: "Rhyme time" } }),
    p("p3", "09:30", "10:10", "Maths", "subject", { state: "not_done", line: "Counting to 20", activity: { id: "a2", code: "MAT.01", name: "Count the beads" } }),
    p("p4", "10:10", "10:30", "Snack break", "fixed"),
    p("p5", "10:30", "11:10", "General Awareness", "subject", { line: "Our five senses", activity: { id: "a3", code: "GA.01", name: "Sense walk" } }),
    p("p6", "11:10", "11:50", "Art", "specialist", { line: "Finger painting" }),
    p("p7", "11:50", "12:30", "Free", "empty"),
    p("p8", "12:30", "13:10", "Lunch", "fixed"),
    p("p9", "13:10", "13:50", "Maths", "subject", { line: "Shapes around us", activity: { id: "a4", code: "MAT.02", name: "Shape hunt" } }),
    p("p10", "13:50", null, "Story time", "subject", { line: "Read-aloud" }),
  ],
};

/** What each build draws, worked out once from the same rules the real page uses (chip, now line, countdown). */
export function view(d: Day = DAY, now = NOW) {
  const work = d.periods.map((x) => ({ p: x, chip: chipOf(x, { now, day: "today" }) as Chip | null }));
  const lessons = d.periods.filter(isLesson);
  const next = work.find((w) => w.chip === "doNow") ?? work.find((w) => isLesson(w.p) && w.p.starts_at > now);
  const line = nowAt(d.periods, now);
  const counts = {
    periods: d.periods.length,
    lessons: lessons.length,
    breaks: d.periods.filter((x) => x.kind === "fixed").length,
    activities: d.periods.filter((x) => x.activity).length,
  };
  const after = work.find((w) => isLesson(w.p) && w.p.starts_at > now);
  return { d, now, work, next, line, counts, after, soon: after ? countdown(now, after.p.starts_at) : null, time: timeOf };
}
export const href = (id: string) => `?period=${id}`;
