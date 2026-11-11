import type { AssessmentRow } from "@/lib/queries-papers";

// A class's home assessments or chosen papers for a week are one assessment, named for what they are.
const MANY: Record<string, string> = {
  focus: "Home assessments",
  custom: "Chosen papers",
};

/** Which assessment a paper or a row is: its kind, class, week and skill set or worksheet. */
export const assessmentKey = (a: { kind: string; section: string | null; week: string | null; set: string | null }) =>
  [a.kind, a.section ?? "", a.week ?? "", a.set ?? ""].join("~");

export const assessmentTitle = (a: Pick<AssessmentRow, "set" | "kind" | "title">) => (a.set ? a.title : (MANY[a.kind] ?? a.title));

export type Named = AssessmentRow & {
  /** The name shown: an educator's, else built from the sheet. */
  name: string;
  /** The files read whose codes belong to it, by their own names. */
  files: string[];
  /** A file read that belongs to no assessment: it is its own row. */
  ghost?: string;
};
