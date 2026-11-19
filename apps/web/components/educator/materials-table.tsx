import type { MaterialLine } from "@/lib/educator/types";

// The controls of the materials pages (the Timetable's Materials and its notes to read): a button and a field at the tap size, and a
// line with the day it is needed on. The class's list itself is drawn by app/(app)/timetable/materials (by day, a line's detail on the right).
export const BTN = "btn secondary";
export const FIELD = "min-h-[var(--tap)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-2)]";

export type DayLine = MaterialLine & { day: string };

/** A name as a word in a sentence, for "or crayons" (CP-85): the first letter lower case unless it starts an acronym or a code ("PVA glue", "A4 paper"). */
export const word = (name: string) => name.replace(/^([A-Z])(?![A-Z0-9])/, (c) => c.toLowerCase());
/** What a line for a group of alternatives stands for besides itself: "crayons", or "crayons or markers". Empty when the item is needed on its own. */
export const orWords = (l: Pick<MaterialLine, "alternatives">) => l.alternatives.map((a) => word(a.name)).join(" or ");
