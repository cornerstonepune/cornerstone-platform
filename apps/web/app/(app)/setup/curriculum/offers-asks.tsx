import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { KindTile } from "@/components/kind-tile";
import { linked, type Offer } from "@/lib/curriculum-screens";
import { ROLE_WORDS, type Ask } from "@/lib/queries-people";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";
import { answerAsk, answerOffer } from "./actions";
import { MachineMark } from "@/components/origin";

// Below the Curriculum list: the skills the machine offers for an activity the examples did not show (Yes adds the link, No closes the
// offer, one row at a time), and the questions the engine put to a person about the curriculum. Moved out of the page, unchanged.

export async function Offers({ offers, page, href, back, reviews }: { offers: Offer[]; page: number; href: (o: number) => string; back: string; reviews: boolean }) {
  const shown = offers.slice((page - 1) * 10, page * 10);
  if (!shown.length) return null;
  const had = await linked([...new Set(shown.map((o) => o.activity.code))]);
  const columns: Column<Offer>[] = [
    { key: "activity", label: "Activity", value: (o) => o.activity.name, cell: (o) => <span className="flex items-center gap-2"><KindTile kind="activity" />{o.activity.name}</span> },
    { key: "offered", label: "Skills offered", value: (o) => o.skills.map((s) => s.name).join(", ") },
    {
      key: "linked",
      label: "Already linked",
      value: (o) => (had.get(o.activity.code) ?? []).map((s) => s.name).join(", "),
      // CP-53: the machine's links show too, with its symbol and "to approve"
      cell: (o) => (
        <span className="flex flex-wrap gap-x-[var(--space-2)]">
          {(had.get(o.activity.code) ?? []).map((s) => (
            <span key={s.code} data-origin={s.source === "machine" ? "machine" : undefined}>
              {s.name}
              {s.source === "machine" ? <> <MachineMark /> <span className="text-[var(--ink-muted)]">to approve</span></> : null}
            </span>
          ))}
        </span>
      ),
    },
    { key: "why", label: "Why", value: (o) => o.reason },
    {
      key: "answer",
      label: "",
      keep: true,
      value: () => "answer",
      cell: (o) =>
        reviews ? (
          <form action={answerOffer} className="flex gap-2">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" name="do" value="yes" className="btn" data-offer-yes>Yes<span className="sr-only"> add the offered skills to {o.activity.name}</span></button>
            <button type="submit" name="do" value="no" className="btn secondary" data-offer-no>No<span className="sr-only"> close the offer for {o.activity.name}</span></button>
          </form>
        ) : null,
      width: "11rem",
    },
  ];
  return (
    <section aria-label="Offers waiting" data-offers>
      <h2 className="mb-[var(--space-1)] font-sans text-[length:var(--text-body)]">Offers waiting</h2>
      <p className="mb-2 text-[length:var(--text-label)] text-[var(--ink-muted)]">Skills the machine offers for an activity the examples did not show. Yes adds the skill to that activity; No closes the offer.</p>
      <DataTable label="Offers" columns={columns} rows={offers} rowKey={(o) => o.id} more={{ page, href }} extras={{ attrs: (o) => ({ "data-offer": o.id }) }} />
    </section>
  );
}

export function Asks({ all, me, page, href, back, empty }: { all: Ask[]; me: { name: string; role: string }; page: number; href: (a: number) => string; back: string; empty: boolean }) {
  const open = all.filter((a) => !a.answer);
  const mineFirst = [...open.filter((a) => a.for_role === me.role), ...open.filter((a) => a.for_role !== me.role)];
  const answered = all.filter((a) => a.answer);
  // a question is drafted for a role: its own role answers it, and the coordinator may answer any (the engine checks it again)
  const mayAnswer = (a: Ask) => me.role === a.for_role || me.role === "coordinator";
  const columns: Column<Ask>[] = [
    // the question, and folded under it what the engine drafted and why (13 Nov 2026: the drafts filled the table)
    {
      key: "question",
      label: "Question",
      value: (a) => `${a.question} ${a.drafted} ${a.why ?? ""}`,
      cell: (a) => (
        <div className="grid gap-[var(--space-1)]">
          <span className="flex items-center gap-[var(--space-2)] font-medium"><KindTile kind="objective" />{a.question}</span>
          <details className="text-[length:var(--text-label)]" data-ask-draft>
            <summary className="cursor-pointer text-[var(--link)]">What was drafted, and why</summary>
            <p className="mt-[var(--space-1)]">{a.drafted}</p>
            {a.why ? <p className="mt-[var(--space-1)] text-[var(--ink-muted)]">Why: {a.why}</p> : null}
          </details>
        </div>
      ),
    },
    { key: "for", label: "For", value: (a) => ROLE_WORDS[a.for_role] ?? a.for_role, width: "9rem" },
    { key: "link", label: "", value: (a) => (a.link ? "read" : ""), cell: (a) => (a.link ? <a href={a.link} target="_blank" rel="noreferrer" data-ask-link>Read it in full<span className="sr-only"> ({a.code})</span></a> : null), width: "7rem" },
    {
      key: "answer",
      label: "",
      keep: true,
      value: () => "answer",
      cell: (a) =>
        mayAnswer(a) ? (
          <div className="grid gap-2">
            <form action={answerAsk}>
              <input type="hidden" name="code" value={a.code} />
              <input type="hidden" name="answer" value="agreed" />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className="btn" data-ask-agree>Agree as drafted<span className="sr-only"> ({a.code}), as {me.name}</span></button>
            </form>
            <form action={answerAsk} className="grid gap-1">
              <input type="hidden" name="code" value={a.code} />
              <input type="hidden" name="answer" value="corrected" />
              <input type="hidden" name="back" value={back} />
              <label className="grid gap-1 text-[length:var(--text-label)]">
                <span>What it should say<span className="sr-only"> ({a.code})</span></span>
                <textarea name="correction" rows={2} className="border border-[var(--line)] p-2" data-ask-correction />
              </label>
              <button type="submit" className="btn secondary" data-ask-correct>Correct it<span className="sr-only"> ({a.code}), as {me.name}</span></button>
            </form>
          </div>
        ) : null,
      width: "17rem",
    },
  ];
  return (
    <section aria-label="Questions to answer" id="asks" data-asks>
      <h2 className="mb-[var(--space-1)] font-sans text-[length:var(--text-body)]">Questions to answer</h2>
      <p className="mb-2 text-[length:var(--text-label)] text-[var(--ink-muted)]">What the engine drafted about the curriculum and wants a person to agree with or correct. Your name goes on the answer.</p>
      {empty ? <p role="status" className="mb-2 text-[length:var(--text-label)] text-[var(--ink-muted)]">A correction needs its words: write what it should say.</p> : null}
      {mineFirst.length ? (
        <DataTable label="Questions waiting" columns={columns} rows={mineFirst} rowKey={(a) => a.code} more={{ page, href }} extras={{ attrs: (a) => ({ "data-ask": a.code }) }} />
      ) : (
        <p className="text-[length:var(--text-label)]">Every question is answered.</p>
      )}
      {answered.length ? (
        <div className="mt-3">
          <Details summary={`Read the ${answered.length} answered`} name="answered-asks">
            <ul className="grid gap-3 text-[length:var(--text-label)]">
              {answered.map((a) => (
                <li key={a.code}>
                  <b>{a.question}</b>
                  <span className="block text-[var(--ink-muted)]">{a.answer === "agreed" ? "Agreed as drafted" : "Corrected"} by {a.answered_by}, {dateWords(a.answered_at)}</span>
                  {a.correction ? <span className="block">It should say: {a.correction}</span> : null}
                </li>
              ))}
            </ul>
          </Details>
        </div>
      ) : null}
    </section>
  );
}
