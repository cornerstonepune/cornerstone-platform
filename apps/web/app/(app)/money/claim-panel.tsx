import Link from "@/components/link";
import type { Opened } from "@/components/detail-panel";
import { KeyValue } from "@/components/key-value";
import { StatusChip, type State } from "@/components/status-chip";
import { dayWords } from "@/lib/money-claims";
import { rupees, STATUS_WORDS, type Claim } from "@/lib/money-format";
import { withdrawClaim } from "./actions";
import { AddBill, BillPicture } from "./bill-parts";

// A claim's chip: the word is the engine's status in the school's words, the colour the work state it is drawn in (green done, amber waiting,
// red a fix, grey nothing to do).
const STATE_OF: Record<(typeof STATUS_WORDS)[Claim["status"]]["tone"], State> = { done: "done", waiting: "waiting", fix: "fixThis", quiet: "stopped" };
export const chipOf = (c: Claim) => <StatusChip state={STATE_OF[STATUS_WORDS[c.status].tone]} words={STATUS_WORDS[c.status].words} compact />;

/** What happens next, and the reason when the claim was sent back or voided, in words. */
export function Standing({ c }: { c: Claim }) {
  return (
    <>
      {c.next}
      {c.reason ? <> “{c.reason}”</> : null}
    </>
  );
}

/** The claim opened on the right: its details, its bill, and what the person may do with it (withdraw while submitted, add the bill, file it again). */
export function claimPanel(c: Claim): Opened {
  const open = c.status !== "withdrawn" && c.status !== "voided";
  return {
    key: `claim:${c.id}`,
    kind: "note",
    icon: "form",
    title: c.vendor,
    line: `${rupees(c.amount)} · ${dayWords(c.spent_on)}`,
    closeHref: "/money",
    lead: (
      <p className="flex flex-wrap items-baseline gap-[var(--space-1)]" data-claim-standing>
        {chipOf(c)}
        <span>
          <Standing c={c} />
        </span>
      </p>
    ),
    actions: (
      <>
        {c.status === "sent back" ? (
          <Link href={`/money/new?from=${c.id}`} className="btn" data-file-again>
            File it again
          </Link>
        ) : null}
        {c.status === "submitted" ? (
          <form action={withdrawClaim} className="contents">
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className="b-btn" data-withdraw>
              Withdraw
            </button>
          </form>
        ) : null}
        {!c.has_bill && open ? <AddBill id={c.id} /> : null}
      </>
    ),
    tabs: [
      {
        key: "details",
        label: "Details",
        body: (
          <KeyValue
            rows={[
              { label: "Amount", value: rupees(c.amount), num: true },
              { label: "Spent on", value: dayWords(c.spent_on) },
              { label: "What for", value: c.category },
              ...(c.subcategory ? [{ label: "Which one", value: c.subcategory }] : []),
              ...(c.campus ? [{ label: "Campus", value: c.campus }] : []),
              { label: "Bill", value: c.has_bill ? "Kept" : "None yet" },
            ]}
          />
        ),
      },
      { key: "bill", label: "Bill", body: c.has_bill ? <BillPicture id={c.id} /> : <p className="b-muted">There is no bill on this claim yet.</p> },
    ],
  };
}
