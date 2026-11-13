import Link from "@/components/link";
import { Part } from "@/components/lesson-panel";
import { StackBar } from "@/components/stack-bar";
import type { Session } from "@/lib/auth";
import { classNotes } from "@/lib/notes-loop";
import { seenOn } from "@/lib/period";

// What the Record page showed beside its button (UI-3a), now in the lesson's History tab (page charter B4, Part C "Record: merge into
// B4"): who in the class has not yet been seen on this activity, and the class's latest notes (the lesson's day and the day before,
// newest first), each opening on the confirm screen. The last time this ran is the tab's own first part.
export async function RecordHistory({ me, classId, activity, day }: { me: Pick<Session, "email">; classId: string; activity: string; day: string }) {
  const before = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const [seen, notes] = await Promise.all([seenOn(classId, activity), Promise.all([day, before].map(async (d) => (await classNotes(me, classId, d))?.notes ?? []))]);
  const recent = notes.flat().sort((a, b) => b.received_at.localeCompare(a.received_at));
  return (
    <>
      <Part title="Not yet seen on this activity">
        <div data-not-seen>
          <StackBar
            parts={[
              { state: "done", n: seen.seen, words: "seen" },
              { state: "notAssessed", n: Math.max(0, seen.total - seen.seen), words: "not seen yet" },
            ]}
          />
        </div>
      </Part>
      <Part title="Recent notes for this class">
        {recent.length ? (
          <ul className="grid gap-2" data-recent-notes>
            {recent.slice(0, 3).map((n) => (
              <li key={n.note_id}>
                <Link href={`/notes/${n.note_id}`}>{n.typed ? "Typed marks" : "A voice note"}</Link>
                <span className="b-muted">
                  {" "}
                  · {n.typed ? "Form" : "Voice note"} · {n.children.length} {n.children.length === 1 ? "child" : "children"} named
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted" data-recent-notes>
            No notes yet.
          </p>
        )}
      </Part>
    </>
  );
}
