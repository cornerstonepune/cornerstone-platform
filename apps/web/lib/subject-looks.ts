import { cache } from "react";
import { sql } from "./db";

// The subject colours, for every block (docs/frontend/page-charter.md A3: a lesson, an activity, a bar, a chip, everywhere, not only the
// timetable). Three looks, numeracy blue, language rose and arts amber, each a set of tokens (--subject-<look>, -bg, -ink); which subject
// takes which is the school's own row (config `timetable.subject_looks`, a subject's code to its look). A subject with no entry is drawn as
// arts, so no code here names a subject. A block sets `data-subject={look}` and the colours follow (components/blocks.css).
export type Look = "numeracy" | "language" | "arts";
export type Looks = Record<string, Look>;

export const subjectLooks = cache(async (): Promise<Looks> => {
  const [r] = await sql<{ value: Looks }[]>`select value from config where key = 'timetable.subject_looks'`;
  return r?.value && typeof r.value === "object" ? r.value : {};
});
export const subjectLook = (looks: Looks, code: string | null): Look => (code && looks[code]) || "arts";
