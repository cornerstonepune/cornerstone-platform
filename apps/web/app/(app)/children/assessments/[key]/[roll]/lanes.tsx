import Link from "@/components/link";
import { qLabel } from "./question-label";
import { StackBar } from "@/components/stack-bar";
import { StatusChip, type State } from "@/components/status-chip";
import { mistakeName } from "@/lib/mistake-name";
import type { CaptureAnswer } from "@/lib/queries-read";

// What this paper says, skill by skill, before anyone drills in: for each skill the questions touch, how many are right of those settled, how many are
// still with the person, the mistakes matched, and each answer one tap away. The three signals stay three (rule 5): a wrong answer with working is not a wrong answer.
// (The old Marking page's lanes, moved.)
export type Marked = { a: CaptureAnswer; at: number; mark: "right" | "wrong" | "working" | "blank" | "judge"; chip: { state: State; words: string } };

export function Lanes({ marks, lane, names, href }: { marks: Marked[]; lane: (a: CaptureAnswer) => string; names: Record<string, string>; href: (id: string) => string }) {
  const lanes = [...new Set(marks.map((x) => lane(x.a)))].map((name) => {
    const rows = marks.filter((x) => lane(x.a) === name);
    const settled = rows.filter((x) => x.mark !== "judge");
    return {
      name,
      rows,
      right: settled.filter((x) => x.mark === "right").length,
      settled: settled.length,
      open: rows.length - settled.length,
      mistakes: [...new Set(settled.flatMap((x) => x.a.misconception_codes.map((c) => mistakeName(names, c, x.a.op, x.a.mistake_skills?.[c] ?? x.a.skill_code))))],
    };
  });
  if (!lanes.length) return null;
  return (
    <section className="b-card my-4" aria-label="What this paper says, by skill">
      <h2 className="b-card-h">What this paper says, by skill</h2>
      <ol className="grid gap-4">
        {lanes.map((l) => (
          <li key={l.name} data-lane={l.name}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h3>{l.name}</h3>
              <span className="b-muted">
                {l.settled ? `${l.right} of ${l.settled} right` : "nothing settled yet"}
                {l.open ? ` · ${l.open} still with you` : ""}
              </span>
            </div>
            {l.settled ? <StackBar parts={[{ state: "done", n: l.right, words: "right" }, { state: "toCheck", n: l.settled - l.right, words: "not right" }]} /> : null}
            <ul className="mt-2 flex flex-wrap gap-2">
              {l.rows.map((x) => (
                <li key={x.a.id}>
                  <Link href={href(x.a.id)} title={`Question ${qLabel(x.a, x.at)}: ${x.a.question}`} className="no-underline" data-lane-answer="">
                    <StatusChip state={x.chip.state} words={`${qLabel(x.a, x.at)} · ${x.chip.words}`} round />
                  </Link>
                </li>
              ))}
            </ul>
            {l.mistakes.length ? <p className="mt-1 text-terracotta">Mistake matched: {l.mistakes.join("; ")}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
