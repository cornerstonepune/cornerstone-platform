import type { Rules } from "@/lib/timetable-rules";
import type { RuleBody } from "./actions";

// What puts a rule change back (CP-71, design F6: every action can be undone). Worked out from the rules before and after the change, so
// an Undo is one more ordinary change through the same door, kept in the history like any other.

export function undoOf(before: Rules, after: Rules, did: RuleBody): RuleBody {
  if (did.rule === "limit") {
    const same = (l: { subject_code: string; span: string }) => l.subject_code === did.subject_code && l.span === did.span;
    const was = did.action === "remove" ? before.limits.find((l) => l.id === did.id) : before.limits.find(same);
    if (was) return { rule: "limit", action: "set", subject_code: was.subject_code, span: was.span, fewest: was.fewest, most: was.most, level: was.level };
    return { rule: "limit", action: "remove", id: after.limits.find(same)?.id };
  }
  if (did.action === "remove") {
    const was = before.away.find((a) => a.id === did.id);
    return { rule: "away", action: "set", staff_id: was?.staff_id, weekday: was?.weekday, week_code: was?.week ?? null, period_id: was?.period_id ?? null, reason: was?.reason };
  }
  const held = new Set(before.away.map((a) => a.id));
  return { rule: "away", action: "remove", id: after.away.find((a) => !held.has(a.id))?.id };
}
