import { Icon } from "@/lib/icons";
import { APPROVALS, APPROVAL_WORDS, ORIGINS, ORIGIN_WORDS, type Approval, type Origin } from "@/lib/origin";
import type { Filter } from "./filter-bar";

// The machine symbol and the origin filter (CP-48, Done when 10): whatever the machine made or linked carries this one symbol, on
// Curriculum, an activity's page, the lesson panel and the timetable, and every list there can be narrowed to what came from the
// sheet, the machine or a person. Nothing waits for a person because of it: anyone edits directly.
export const MACHINE_WORDS = "Made by the machine";

/** The one machine symbol. `words`: its words beside it, where the origin is the thing being said (a part's origin line). */
export function MachineMark({ words }: { words?: boolean }) {
  return (
    <span className="b-machine" data-machine title={MACHINE_WORDS}>
      <Icon name="from-draft" size={16} />
      {words ? <span>{MACHINE_WORDS}</span> : <span className="sr-only">{MACHINE_WORDS}</span>}
    </span>
  );
}

/** The symbol when the thing is the machine's; nothing otherwise. */
export const MachineIf = ({ origin }: { origin: Origin | null | undefined | readonly (Origin | null)[] }) =>
  (Array.isArray(origin) ? origin.includes("machine") : origin === "machine") ? <MachineMark /> : null;

/** The origin filter, one dropdown of the page's one FilterBar (page charter A4): any origin, or sheet, machine or person. */
export const originFilter = (value: Origin | undefined): Filter => ({
  name: "origin",
  label: "Origin",
  value,
  all: "Any origin",
  options: ORIGINS.map((o) => [o, ORIGIN_WORDS[o]] as const),
});

/** The approval filter (CP-51): what is still to approve, or what is approved; the same words on every page that has it. */
export const approvalFilter = (value: Approval | undefined): Filter => ({
  name: "approval",
  label: "Approval",
  value,
  all: "Approved or not",
  options: APPROVALS.map((a) => [a, APPROVAL_WORDS[a]] as const),
});
