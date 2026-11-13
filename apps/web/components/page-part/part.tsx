import "./page-part.css";
import { Icon, type IconName } from "@/lib/icons";
import { PART_WORDS, type PagePart } from "@/lib/page-part";
import { MachineMark } from "../origin";

// One part of an activity page, drawn the same wherever it is shown (D-075): its name, whose words they are (an icon and a
// word, never colour alone), and the words themselves: steps as a short list, thinking as an idea with each slip's keyword
// highlighted and how to spot it, anything else as text. A part the machine made carries the one machine symbol
// (components/origin.tsx) and waits on nobody (CP-48). It reads and asks nothing: what a person may do with the part (edit) comes
// in as `actions`, or `editor` in place of the words (never both: the type says so), from the screen that knows who is asking.
// A screen with neither shows the part read-only.
const ORIGIN: Record<string, [IconName, string]> = {
  school: ["from-school", "From the sheet"],
  person: ["from-person", "A person's words"],
};

/** Where a part's words came from: the sheet, the machine (its one symbol) or a person. */
export function Origin({ part }: { part: PagePart }) {
  if (part.source === "drafted")
    return (
      <span className="pp-origin" data-source="drafted">
        <MachineMark words />
      </span>
    );
  const [icon, words] = ORIGIN[part.source] ?? ORIGIN.school;
  return (
    <span className="pp-origin" data-source={part.source}>
      <Icon name={icon} size={16} /> {words}
    </span>
  );
}

/** The words of a part, in the shape its kind asks for. */
export function Words({ part }: { part: PagePart }) {
  if (!part.text) return <p className="pp-note">Nothing written yet.</p>;
  if (part.kind === "bullets")
    return (
      <ul className="pp-steps">
        {part.items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    );
  if (part.kind === "thinking" && part.idea !== null)
    return (
      <>
        <p>{part.idea}</p>
        {part.slips.map((s, i) => (
          <div className="pp-slip" key={i}>
            <mark>{s.keyword}</mark>
            <small>How to spot it: {s.spot}</small>
          </div>
        ))}
      </>
    );
  return <p>{part.text}</p>;
}

/** The part as a card: heading, origin, then its words (or `editor`), then `actions`. The heading is an h2: the page's own is the h1. */
export function PartView({ part, actions, editor }: { part: PagePart } & ({ actions?: React.ReactNode; editor?: never } | { editor: React.ReactNode; actions?: never })) {
  return (
    <section className="pp-card" data-card={part.part} data-source={part.source || "empty"}>
      <header>
        <h2>{PART_WORDS[part.part]}</h2>
        {part.source ? <Origin part={part} /> : <span className="pp-note">Empty</span>}
      </header>
      {editor ?? <Words part={part} />}
      {actions}
    </section>
  );
}
