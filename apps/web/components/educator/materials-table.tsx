import type { MaterialLine } from "@/lib/educator/types";

// The controls of the materials pages (the Timetable's Materials and its notes to read): a button and a field at the tap size, and a
// line with the day it is needed on. The class's list itself is drawn by app/(app)/timetable/materials (by day, a line's detail on the right).
export const BTN = "inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center gap-[var(--space-1)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-2)] text-[length:var(--text-label)] font-medium text-[var(--ink)]";
export const FIELD = "min-h-[var(--tap)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-2)]";

export type DayLine = MaterialLine & { day: string };
