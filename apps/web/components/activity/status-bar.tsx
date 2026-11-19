import { approveLinks } from "@/app/(app)/setup/curriculum/actions";
import { MachineMark } from "@/components/origin";

// The slim bar under an activity's title: one line that says what the machine drafted and waits for a person, with Approve, and Approve
// & next where another activity of the grade waits. It is the one place the page says "machine-made"; the sections carry only a dot.
/** One Approve: what the machine made for this activity or objective becomes a person's. */
export function Approve({ kind = "activity", code, name, back, words, quiet }: { kind?: "activity" | "objective"; code: string; name: string; back: string; words: string; quiet?: boolean }) {
  return (
    <form action={approveLinks} data-approve-form>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className={quiet ? "btn secondary" : "btn"} {...(quiet ? { "data-approve-next": "" } : { "data-approve": "" })}>
        {words}
        <span className="sr-only"> what the machine made for {name}</span>
      </button>
    </form>
  );
}

export function StatusBar({ code, name, parts, links, reviews, here, next }: { code: string; name: string; parts: number; links: number; reviews: boolean; here: string; next: { code: string; name: string; left: number; href: string } | null }) {
  const said = [parts ? `${parts} ${parts === 1 ? "part" : "parts"}` : "", links ? `${links} ${links === 1 ? "link" : "links"}` : ""].filter(Boolean).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-2)]" data-status-bar>
      <p className="flex items-center gap-[var(--space-1)]" data-machine-line>
        <MachineMark />
        <span>Drafted by the machine: {said}</span>
      </p>
      {reviews ? (
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <Approve code={code} name={name} back={here} words="Approve" />
          {next ? <Approve code={code} name={name} back={next.href} words={`Approve & next (${next.left})`} quiet /> : null}
        </div>
      ) : null}
    </div>
  );
}
