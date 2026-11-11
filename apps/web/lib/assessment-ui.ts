// What the three assessment screens (UI-4) say about an assessment, from the rows the queries give: where its address is, which
// lane of the board it stands in, the chip that says what it waits for, and the three tiles' counts. Pure: the steps themselves
// are lib/assessment-steps.ts, and nothing here changes them.
import type { State } from "@/components/status-chip";
import type { Stage } from "./queries-papers";
import { actionOf, type Action, type Counts } from "./assessment-steps";

/** An assessment's address: its key (kind, class, week, set) in one piece. */
export const assessmentHref = (key: string) => `/children/assessments/${encodeURIComponent(key)}`;
/** One child's copy of it, by the Sr. No. */
export const paperHref = (key: string, roll: string) => `${assessmentHref(key)}/${encodeURIComponent(roll)}`;

/** The board's lanes: who has the paper. A lane is the table's rows whose next action is one of its kinds. */
export const LANES: readonly { key: string; label: string; state: State; kinds: readonly Action["kind"][]; empty: string }[] = [
  { key: "approve", label: "To approve and print", state: "toApprove", kinds: ["approve", "print"], empty: "Nothing to approve or print" },
  { key: "children", label: "With the children", state: "toDo", kinds: ["upload"], empty: "No paper is with the children" },
  { key: "check", label: "To read and check", state: "toSignOff", kinds: ["reading", "check", "signoff"], empty: "Nothing to read or check" },
  { key: "results", label: "Results in", state: "done", kinds: ["results"], empty: "No results in yet" },
];

export const laneOf = (kind: Action["kind"]) => LANES.find((l) => l.kinds.includes(kind));

/** What an assessment waits for, said as a chip: the state and the words. The same words are the stepper's amber step. */
export function waitsFor(c: Counts, waiting: number): { state: State; words: string; action: Action } {
  const action = actionOf(c, waiting);
  switch (action.kind) {
    case "approve":
      return { state: "toApprove", words: "Waits for approval", action };
    case "print":
      return { state: "toApprove", words: "Waits for print", action };
    case "upload":
      return { state: "withChildren", words: "With the children", action };
    case "reading":
      return { state: "reading", words: "Being read", action };
    case "check":
      return waiting > 0
        ? { state: "judge", words: `${waiting} answer${waiting === 1 ? "" : "s"} to judge`, action }
        : { state: "toCheck", words: "To check", action };
    case "signoff":
      return { state: "toSignOff", words: "To sign off", action };
    case "results":
      return { state: "done", words: "Results in", action };
    default:
      return { state: "replaced", words: "Replaced by a newer one", action };
  }
}

type Waiting = { counts: Counts; waiting: number };

/** The three tiles of the strip, each counting the rows it stands for: answers for you to judge (do now); packs to approve and
 *  papers to sign off (this week); every paper confirmed (done). */
export function tiles(rows: readonly Waiting[]) {
  const kinds = rows.map((r) => ({ kind: actionOf(r.counts, r.waiting).kind, waiting: r.waiting }));
  return {
    doNow: kinds.filter((k) => k.kind === "check" && k.waiting > 0).length,
    thisWeek: kinds.filter((k) => k.kind === "approve" || k.kind === "signoff").length,
    done: kinds.filter((k) => k.kind === "results").length,
  };
}

/** The stage filter's choices: the one thing each row waits for, in the words the row says. */
export const STAGE_WORDS: Record<string, string> = {
  approve: "Created, to approve",
  print: "Approved, to print",
  upload: "Printed, to upload",
  reading: "Uploaded, being read",
  check: "Read, to check",
  signoff: "Checked, to sign off",
  results: "Results in",
};

// A stage as a state of the one chip: what waits on a person is red, what waits on something else amber, done is green.
export const STAGE_STATE: Record<Stage, State> = {
  made: "toApprove",
  printed: "withChildren",
  scanned: "toCheck",
  checked: "toSignOff",
  "signed off": "done",
  replaced: "replaced",
};
