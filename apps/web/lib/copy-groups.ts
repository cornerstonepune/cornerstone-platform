// Where one child's copy of an assessment stands, in the order an educator needs them (answers to judge first), said as a state of the one
// chip. Read by the assessment's own page and by its panel on the Assessments board (page charter B6), so both say a copy the same way.
// Pure: the copy's stage and counts are the papers query's (lib/queries-papers.ts).
import type { State } from "@/components/status-chip";
import type { PaperListRow } from "./queries-papers";

export type Group = "judge" | "signoff" | "check" | "read" | "children" | "made" | "results" | "replaced";
export const GROUPS: { key: Group; label: string; state: State }[] = [
  { key: "judge", label: "Answers to judge", state: "judge" },
  { key: "signoff", label: "To sign off", state: "toSignOff" },
  { key: "check", label: "To check", state: "toCheck" },
  { key: "read", label: "Being read", state: "reading" },
  { key: "children", label: "With the children", state: "withChildren" },
  { key: "made", label: "Not printed yet", state: "toApprove" },
  { key: "results", label: "Results in", state: "done" },
  { key: "replaced", label: "Replaced by a newer one", state: "replaced" },
];

export const groupOf = (p: Pick<PaperListRow, "stage" | "waiting" | "answers">): Group =>
  p.stage === "replaced" ? "replaced"
  : p.stage === "signed off" ? "results"
  : p.waiting > 0 ? "judge"
  : p.stage === "checked" ? "signoff"
  : p.stage === "scanned" ? (p.answers === 0 ? "read" : "check")
  : p.stage === "printed" ? "children"
  : "made";

export const groupRow = (g: Group) => GROUPS.find((x) => x.key === g)!;
