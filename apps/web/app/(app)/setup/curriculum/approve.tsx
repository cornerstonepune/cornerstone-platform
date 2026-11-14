import { approveLinks } from "./actions";

// CP-51: the reviewer's one Approve on an activity or an objective the machine made or linked: its machine links (and an activity's
// drafted parts) become the person's. It reads "Approved" after, and a mark on the activity is evidence on those skills from then on.
/** `words`: the button's visible words ("Approve" in the panel; the activity's own page says "Approve all of this activity", CP-53). */
export function ApproveForm({ kind, code, name, back, words = "Approve" }: { kind: "activity" | "objective"; code: string; name: string; back: string; words?: string }) {
  return (
    <form action={approveLinks} className="flex items-center gap-[var(--space-2)]" data-approve-form>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" className="btn" data-approve>
        {words}<span className="sr-only"> what the machine made for {name}</span>
      </button>
      <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">Until then its marks reach no skill the machine linked.</span>
    </form>
  );
}
