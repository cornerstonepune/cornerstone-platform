import { Card } from "@/components/cards";
import Link from "@/components/link";
import { StatusChip, type State } from "@/components/status-chip";
import { cardLine, fortnightWords, type BuildHome, type CardState, type HomeCard } from "@/lib/timetable-build";
import { startFrom } from "./actions";

// The Build home (wireframe 1): one card per class, a title, one line, one status chip, one action. A class with no day starts from
// another class's day, so no grid is ever blank. Only a coordinator sees the start form; everyone else reads.
const CHIP: Record<CardState, { state: State; words: string }> = {
  todo: { state: "notAssessed", words: "to do" },
  waiting: { state: "waiting", words: "to finish" },
  fix: { state: "toCheck", words: "fix now" },
  done: { state: "done", words: "ready" },
};

function Start({ card, sources }: { card: HomeCard; sources: HomeCard[] }) {
  if (!sources.length) return <p className="bd-empty">No class has a day yet. Set one up in Timetable rules.</p>;
  const only = sources.length === 1 ? sources[0] : null;
  return (
    <form action={startFrom}>
      <input type="hidden" name="class_id" value={card.class_id} />
      {only ? (
        <input type="hidden" name="from_class" value={only.class_id} />
      ) : (
        <label>
          Start from
          <select name="from_class" defaultValue="">
            <option value="" disabled>
              Choose a class
            </option>
            {sources.map((s) => (
              <option key={s.class_id} value={s.class_id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn secondary" data-start={card.class_id}>
        {only ? `Start from ${only.name}'s day` : "Start from this day"}
      </button>
    </form>
  );
}

export function BuildHomeView({ home, coordinator }: { home: BuildHome; coordinator: boolean }) {
  const sources = home.classes.filter((c) => c.has_day);
  return (
    <ul className="bd-cards" aria-label="Classes">
      {home.classes.map((c) => (
        <li key={c.class_id}>
          <Card as="article" className="bd-card" data-class-card={c.class_id} data-state={c.state}>
            <h2>{c.name}</h2>
            <p className="b-muted">{cardLine(c)}</p>
            {c.next_fortnight ? <p className="b-muted">Next: {fortnightWords(c.next_fortnight)}</p> : null}
            <StatusChip state={CHIP[c.state].state} words={CHIP[c.state].words} compact round />
            {c.has_day ? (
              <Link href={`/timetable/build?class=${c.class_id}`} className="btn secondary">
                {c.state === "done" ? "Open" : "Continue"}
              </Link>
            ) : coordinator ? (
              <Start card={c} sources={sources} />
            ) : (
              <p className="bd-empty">A coordinator starts this class.</p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
