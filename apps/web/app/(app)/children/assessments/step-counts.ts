import type { Counts } from "@/lib/assessment-steps";
import type { AssessmentRow } from "@/lib/queries-papers";

/** An assessment's copies as the counts the steps are read from: a copy replaced by a newer one is none of its copies. */
export const countsOf = (a: Pick<AssessmentRow, "by" | "unread" | "kind">): Counts => ({ by: a.by, unread: a.unread, home: a.kind === "focus" });
