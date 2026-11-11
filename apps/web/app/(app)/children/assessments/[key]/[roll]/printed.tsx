import { Question } from "@/components/question";
import type { ItemRow } from "@/lib/queries-bank";

// A question on a copy before it prints: its own words as it prints, and what taking it off would cost (goals/paper_review_add_remove.yaml).

export type Q = {
  id: string;
  item_key: string;
  fmt: string;
  stem: string;
  spec: ItemRow["spec"];
  text: string;
  skill_set: string;
  skill: string | null;
  topic_name: string | null;
  level: string;
  kind: string | null;
  kind_words: string | null;
  days?: number | null;
};
export type Covers = { skill_set: string; name: string; level: string; n: number };
export type Review = {
  qr: string;
  child_id: string | null;
  kind: string;
  state: "waiting" | "approved" | "printed" | "replaced";
  why_not: string;
  newer: string | null;
  approved_by: string | null;
  questions: Q[];
  covers: Covers[];
  min: number;
  max: number;
  pages: number;
};

/** A question drawn as the page prints it, from its own row: the one drawing the bank and the answer key use. */
export function Printed({ q }: { q: Q }) {
  const it: ItemRow = { ...q, responses: [], status: "active", times_used: 0, skill_set_code: q.skill_set, skill_set_name: q.skill, difficulty: q.level };
  return <Question it={it} />;
}

/** What taking this question off would cost, in words; "" when nothing, and no confirm is asked. */
export function costOf(r: Review, q: Q): string {
  const out: string[] = [];
  if (r.questions.length - 1 < r.min) return "";
  if (r.questions.length === 1) out.push("The paper would hold no question.");
  else if (r.covers.find((c) => c.skill_set === q.skill_set && c.level === q.level)?.n === 1)
    out.push(`${q.skill ?? q.skill_set} · ${q.level} would have no question on this paper.`);
  if (r.state === "approved") out.push("Its approval is withdrawn: it waits for approval again before it prints.");
  return out.join(" ");
}
