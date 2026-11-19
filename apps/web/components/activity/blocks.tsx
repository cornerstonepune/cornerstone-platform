import { RubricRows } from "@/components/lesson-panel";
import { Words } from "@/components/page-part/part";
import { Icon } from "@/lib/icons";
import type { ActivityPage } from "@/lib/teaching";

// The activity, read: one set of blocks and one order of headings wherever the activity is shown (the activity's page, Curriculum's panel,
// the timetable's lesson panel and the lesson page): What it is for, Run it, Lay out, Watch for, How to mark, Connects to (Nimish, 19 Nov
// 2026). These are the bodies only; the page puts its Edit beside each heading, a panel puts nothing.
export const HEAD = { for: "What it is for", run: "Run it", lay: "Lay out", watch: "Watch for", mark: "How to mark", connects: "Connects to" } as const;
export const LEVELS = ["level_0", "level_1", "level_2", "level_3"] as const;
const MUTED = "text-[var(--ink-muted)]";

export const part = (page: ActivityPage, k: string) => page.parts.find((p) => p.part === k);

/** The steps, numbered; the school's text as written where it has no list. */
export function Run({ page }: { page: ActivityPage }) {
  const p = part(page, "steps");
  if (!p?.text) return <p className={MUTED} data-empty>No steps written yet.</p>;
  return p.items.length ? (
    <ol className="grid list-decimal gap-[var(--space-1)] pl-[var(--space-4)]" data-part="steps">
      {p.items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  ) : (
    <p className="whitespace-pre-line">{p.text}</p>
  );
}

/** What to lay out: each item with its count, the second of two alternatives marked "or" (CP-85); else the school's text. */
export function Lay({ page }: { page: ActivityPage }) {
  const items = page.materials.items;
  if (!items.length) return page.materials.text ? <p className="whitespace-pre-line">{page.materials.text}</p> : <p className={MUTED} data-empty>Nothing written yet.</p>;
  return (
    <ul className="grid gap-[var(--space-1)]" data-materials data-part="materials">
      {items.map((m, i) => (
        <li key={m.name} className="flex items-center gap-[var(--space-2)]" data-alt-group={m.alt_group ?? undefined}>
          {m.alt_group !== null && items[i - 1]?.alt_group === m.alt_group ? (
            <span className="b-label b-muted inline-block w-4 text-center" data-or>or</span>
          ) : (
            <Icon name="materials" size={16} />
          )}
          <span className="flex-1">{m.name}</span>
          {m.quantity !== null ? <span className="b-num">× {m.quantity}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** What children mix up, and how to see it. */
export function Watch({ page }: { page: ActivityPage }) {
  const p = part(page, "thinking");
  return p?.text ? <Words part={p} /> : <p className={MUTED} data-empty>Nothing written yet.</p>;
}

/** The four levels once, each in the state scale's colour. */
export function Mark({ page }: { page: ActivityPage }) {
  return <RubricRows levels={LEVELS.map((k) => part(page, k)?.text ?? "")} />;
}

/** What it is for, in a line. */
export function For({ page }: { page: ActivityPage }) {
  const p = part(page, "objective");
  return p?.text ? <p data-part="outcome">{p.text}</p> : <p className={MUTED} data-empty>Not written yet.</p>;
}
