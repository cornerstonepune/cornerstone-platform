import { staffList } from "@/lib/queries";
import { packFacts } from "@/lib/queries-assessment-extras";
import { dateWords } from "@/lib/week";

// The packs of one assessment, as the school made them: a pack is the copies approved together. The first is approved by one person on one
// day; a copy made later (a child who joined, or a level changed) is a second pack that waits for its own approval. Nothing here approves.
export type Pack = { name: string; words: string; who: string | null; rolls: string[]; made: string | null };

export async function packsOf(ids: string[]): Promise<Pack[]> {
  const facts = await packFacts(ids);
  if (!facts.length) return [];
  const staff = await staffList();
  const nameOf = (email: string) => staff.find((x) => x.email === email)?.name ?? email;
  const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth"];
  const keys = [...new Set(facts.filter((f) => f.approved_on).map((f) => `${f.approved_on}|${f.approved_by ?? ""}`))];
  const packs: Pack[] = keys.map((k, i) => {
    const [on, by] = k.split("|");
    return { name: `${ORDINAL[i] ?? `Pack ${i + 1}`} pack`, words: `approved ${dateWords(on)}`, who: by ? nameOf(by) : null, rolls: [], made: null };
  });
  const waiting = facts.filter((f) => !f.approved_on);
  // a pack waits only when another was approved before it: the first pack's wait is the "This pack" card's own
  if (waiting.length)
    packs.push({
      name: `${ORDINAL[packs.length] ?? `Pack ${packs.length + 1}`} pack`,
      words: "waits for you",
      who: null,
      rolls: waiting.flatMap((f) => (f.roll ? [f.roll] : [])),
      made: waiting[0].made_on,
    });
  return packs;
}

/** "Made on 17-Nov-2026 for Sr. No. 24 and 25." */
export const madeWords = (p: Pack) => {
  const n = p.rolls.length;
  const list = n === 0 ? "" : n === 1 ? p.rolls[0] : `${p.rolls.slice(0, -1).join(", ")} and ${p.rolls[n - 1]}`;
  return `Made on ${dateWords(p.made)}${n ? ` for Sr. No. ${list}` : ""}.`;
};

export function ApprovalLedger({ packs }: { packs: Pack[] }) {
  if (!packs.length) return null;
  return (
    <section aria-label="The approval ledger" data-rail-part="ledger">
      <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">The approval ledger</h2>
      <ul className="grid gap-[var(--space-2)] text-[14px]">
        {packs.map((p) => (
          <li key={p.name} data-pack="">
            <b>{p.name}</b>
            <br />
            <span className="b-muted">{p.words}</span>
            {p.who ? <><br /><span className="b-muted">By {p.who}</span></> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
