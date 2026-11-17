import { EmptyState } from "@/components/empty-state";
import { StatusChip } from "@/components/status-chip";
import type { Problem } from "@/lib/timetable-check";
import { awayWords, educatorWords, limitSentence, type Rules } from "@/lib/timetable-rules";

// What a reader sees under the week grid (CP-71, wireframe 5): the class's problems and its rules as plain lists, nothing to press. It is
// the phone's view of the Build page and the view of anyone who may not build. The words are the same as the builder's panel.
const CHIP = {
  must: { state: "toCheck", words: "must fix" },
  try: { state: "waiting", words: "try to" },
  allowed: { state: "done", words: "allowed" },
} as const;

export function ReadPanel({ problems, rules }: { problems: Problem[]; rules: Rules | null }) {
  const sentences = rules
    ? [
        ...rules.limits.map((l) => ({ key: l.id, words: `${limitSentence(rules, l)}.`, level: l.level === "must" ? "Must" : "Try to" })),
        ...rules.away.map((a) => {
          const who = rules.teaches.find((e) => e.staff_id === a.staff_id);
          return { key: a.id, words: `${who ? educatorWords(who).replace(/^t/, "T") : "An educator"}: ${awayWords(a).replace(/^A/, "a")}.`, level: "Must" };
        }),
      ]
    : [];
  return (
    <div className="bd-read" data-read-panel>
      <section aria-labelledby="bd-read-problems">
        <h2 id="bd-read-problems">Problems</h2>
        {problems.length ? (
          <ul className="bd-probs">
            {problems.map((p) => {
              const chip = p.allowed ? CHIP.allowed : CHIP[p.level];
              return (
                <li key={p.key} className="bd-prob" data-problem={p.kind}>
                  <StatusChip state={chip.state} words={chip.words} compact round />
                  <p className="bd-read-s">{p.sentence}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>All clear. Nothing here stops publishing.</EmptyState>
        )}
      </section>
      <section aria-labelledby="bd-read-rules">
        <h2 id="bd-read-rules">Rules</h2>
        {sentences.length ? (
          <ul className="bd-probs">
            {sentences.map((s) => (
              <li key={s.key} className="bd-prob" data-read-rule>
                <p className="bd-read-s">{s.words}</p>
                <p className="b-muted bd-prob-rule">{s.level}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted bd-none">No rules of this class&apos;s own yet.</p>
        )}
        <p className="b-muted bd-prob-rule">Always on: an educator teaches one class at a time, and a class has one lesson at a time.</p>
      </section>
    </div>
  );
}
