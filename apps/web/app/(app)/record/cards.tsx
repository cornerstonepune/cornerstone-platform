import { Cards } from "@/components/cards";
import { OUTCOME_ORDER, outcomeWords } from "@/components/outcome-states";
import { StackBar } from "@/components/stack-bar";
import type { ClassNote } from "@/lib/notes-loop";
import { lastTime, seenOn } from "@/lib/period";

// The three cards of Record (UI-3a, wireframes/record.html): what the class showed the last time this activity ran, who has not
// yet been seen on it, and the class's latest notes. Shown once a period (so an activity) is chosen.
export async function RecordCards({ classId, activity, day, recent }: { classId: string; activity: string; day: string; recent: ClassNote[] }) {
  const [last, seen] = await Promise.all([lastTime(classId, activity, day), seenOn(classId, activity)]);
  const named = last ? Object.values(last.counts).reduce((t, n) => t + n, 0) : 0;
  return (
    <Cards
      cards={[
        {
          kind: "period",
          title: last ? `Last time this ran, ${last.day}` : "Last time this ran",
          body: last ? (
            <>
              <StackBar parts={OUTCOME_ORDER.map(([k, state]) => ({ state, n: last.counts[k] ?? 0, words: outcomeWords(k) }))} />
              <span className="b-caption">{named} children named</span>
            </>
          ) : (
            <span className="b-muted">Not run with this class yet.</span>
          ),
        },
        {
          kind: "child",
          title: "Not yet seen on this activity",
          body: (
            <StackBar
              parts={[
                { state: "done", n: seen.seen, words: "seen" },
                { state: "notAssessed", n: Math.max(0, seen.total - seen.seen), words: "not seen yet" },
              ]}
            />
          ),
        },
        {
          kind: "note",
          title: "Recent notes for this class",
          body: recent.length ? (
            <ul className="grid gap-2">
              {recent.slice(0, 3).map((n) => (
                <li key={n.note_id}>
                  <a href={`/notes/${n.note_id}`}>{n.typed ? "Typed marks" : "A voice note"}</a>
                  <span className="b-muted">
                    {" "}
                    · {n.typed ? "Form" : "Voice note"} · {n.children.length} {n.children.length === 1 ? "child" : "children"} named
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="b-muted">No notes yet.</span>
          ),
        },
      ]}
    />
  );
}
