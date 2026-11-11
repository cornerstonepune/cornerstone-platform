import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { KindTile } from "@/components/kind-tile";
import { engineGet } from "@/lib/engine";
import type { Column } from "@/lib/ux-rules";
import { decideProposal } from "../../library/actions";

// What children's confirmed answers propose for the bank, still undecided (goals/s21-real-difficulty.yaml, s22): a question far
// easier or harder than its level, with its evidence, which a person removes (its worksheets are rebuilt) or keeps; and a way of
// working their unexplained wrong answers point to, which a person names and adopts or rejects. The engine decides nothing on its
// own. If it cannot be reached the bank still opens, and says so. The old library page's rules, drawn with the shared blocks.
type Mislevelled = { id: string; kind: "mislevelled"; subject: string; direction: "easier" | "harder"; evidence: { n: number; correct: number; difficulty: string; skill_set_code: string } };
type NewMistake = { id: string; kind: "new_mistake"; subject: string; direction: string; evidence: { words: string; examples: { op: string; a: number; b: number; wrote: number }[] } };
type Proposal = Mislevelled | NewMistake;

async function open(): Promise<Proposal[] | null> {
  try {
    const res = await engineGet("/bank/proposals");
    return res.ok ? ((await res.json()) as Proposal[]) : null;
  } catch {
    return null;
  }
}

const sign = (op: string) => (op === "-" ? "−" : op);
const PER_PAGE = 10;

export async function Proposals({ may, back, hrefs, pages }: { may: boolean; back: string; hrefs: { far: (p: number) => string; mistakes: (p: number) => string }; pages: { far: number; mistakes: number } }) {
  const all = await open();
  if (all === null) return <p className="mt-4 text-[14px]">The engine could not be reached, so what children&rsquo;s answers propose cannot be shown just now.</p>;
  const far = all.filter((p): p is Mislevelled => p.kind === "mislevelled");
  const mistakes = all.filter((p): p is NewMistake => p.kind === "new_mistake");
  if (!far.length && !mistakes.length) return null;
  const farPage = Math.min(pages.far, Math.max(1, Math.ceil(far.length / PER_PAGE)));
  const mistakePage = Math.min(pages.mistakes, Math.max(1, Math.ceil(mistakes.length / PER_PAGE)));
  const farColumns: Column<Mislevelled>[] = [
    { key: "q", label: "Question", value: (p) => p.subject, cell: (p) => <span className="flex items-center gap-2"><KindTile kind="assessment" /><Link href={`/setup/question-bank/${p.subject}`} data-proposal-question>{p.subject}</Link></span> },
    { key: "level", label: "Level", value: (p) => p.evidence.difficulty, width: "7rem" },
    { key: "right", label: "Right", value: (p) => `${p.evidence.correct} of ${p.evidence.n}`, num: true, width: "7rem" },
    { key: "found", label: "Children found it", value: (p) => `far ${p.direction} than ${p.evidence.difficulty}` },
    {
      key: "decide",
      label: "",
      keep: true,
      value: () => "decide",
      cell: (p) =>
        may ? (
          <form action={decideProposal} className="flex gap-2">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="back" value={back} />
            <button name="verdict" value="remove" className="btn" data-proposal-remove>Remove from the bank<span className="sr-only"> ({p.subject})</span></button>
            <button name="verdict" value="keep" className="btn secondary" data-proposal-keep>Keep it<span className="sr-only"> ({p.subject})</span></button>
          </form>
        ) : null,
      width: "19rem",
    },
  ];
  const mistakeColumns: Column<NewMistake>[] = [
    { key: "words", label: "What children did", value: (p) => p.evidence.words, cell: (p) => <span className="flex items-center gap-2"><KindTile kind="skill" /><b>{p.evidence.words}</b></span> },
    { key: "seen", label: "Seen as", value: (p) => p.evidence.examples.map((e) => `${e.a} ${sign(e.op)} ${e.b} → ${e.wrote}`).join(" · ") },
    {
      key: "decide",
      label: "",
      keep: true,
      value: () => "decide",
      cell: (p) =>
        may ? (
          <form action={decideProposal} className="grid gap-2">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="back" value={back} />
            <label className="grid gap-1 text-[13px]">
              <span>Its name<span className="sr-only"> ({p.evidence.words})</span></span>
              <input name="name" className="border border-[var(--line)] p-2" placeholder="how a teacher would say it" data-proposal-name />
            </label>
            <div className="flex gap-2">
              <button name="verdict" value="adopt" className="btn" data-proposal-adopt>Adopt it as a mistake<span className="sr-only"> ({p.evidence.words})</span></button>
              <button name="verdict" value="reject" className="btn secondary" data-proposal-reject>Reject<span className="sr-only"> ({p.evidence.words})</span></button>
            </div>
          </form>
        ) : null,
      width: "22rem",
    },
  ];
  return (
    <section className="mt-6" aria-label="What children's answers propose" id="proposals" data-proposals>
      <h2 className="mb-2 text-[16px]">What children&rsquo;s answers propose</h2>
      <p className="mb-2 text-[13px] text-[var(--ink-muted)]">{far.length + mistakes.length} to decide. The engine proposes; a person decides.</p>
      {far.length ? <DataTable label="Questions far off their level" columns={farColumns} rows={far} rowKey={(p) => p.id} more={{ page: farPage, href: hrefs.far }} extras={{ attrs: (p) => ({ "data-proposal": p.id }) }} /> : null}
      {mistakes.length ? (
        <div className="mt-4">
          <p className="mb-2 text-[13px] text-[var(--ink-muted)]">Children wrote these wrong answers and no named mistake explains them. The same way of working gives every one of them, on different questions. Name it to have it recognised from now on, or reject it.</p>
          <DataTable label="Mistakes children seem to make" columns={mistakeColumns} rows={mistakes} rowKey={(p) => p.id} more={{ page: mistakePage, href: hrefs.mistakes }} extras={{ attrs: (p) => ({ "data-proposal": p.id }) }} />
        </div>
      ) : null}
    </section>
  );
}
