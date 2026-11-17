import type { MaterialLine } from "@/lib/educator/types";

// The controls of the materials pages (the Timetable's Materials and its notes to read): a button and a field at the tap size, and a
// line with the day it is needed on. The class's list itself is drawn by app/(app)/timetable/materials (by day, a line's detail on the right).
export const BTN = "btn secondary";
export const FIELD = "min-h-[var(--tap)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-2)]";

export type DayLine = MaterialLine & { day: string };
