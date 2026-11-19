import { requireStaff } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { moneyAccess, moneyQueue } from "@/lib/money-queue";
import { ClaimQueue, type Q } from "../claim-queue";
import { NotForYou } from "@/components/not-for-you";
import { SubmitOnce } from "../submit-once";
import { approve, sendBack } from "./actions";

// To approve (CP-80, specs/CP-80/spec.md): the claims waiting for this person, oldest first. A claim opens in the detail panel with its bill large and two
// buttons: Approve, and Send back, which asks the reason in place. After either the next claim opens by itself. Only for a person who may approve.
export default async function ToApprove({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const [access, queue, q] = await Promise.all([moneyAccess(me), moneyQueue(me), searchParams]);
  if (access.ok && !access.value.can.approve) return <NotForYou stage="Money" title="To approve" who="operations leads and the founders" back={{ href: "/money", label: "Back to My claims" }} />;
  if (!access.ok || !queue.ok)
    return (
      <Screen stage="Money" title="To approve" purpose="Claims waiting for your decision." next={{ href: "/money", label: "My claims" }}>
        <EmptyState>{access.ok ? (queue.ok ? "" : queue.words) : access.words}</EmptyState>
      </Screen>
    );
  return (
    <ClaimQueue
      queue="approve"
      claims={queue.value.approve}
      q={q}
      work={(c, next) => ({
        actions: (
          <>
            <form action={approve}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="next" value={next} />
              <SubmitOnce main busy="Approving…">
                Approve
              </SubmitOnce>
            </form>
            <details data-send-back className="min-w-0">
              <summary className="btn secondary w-fit cursor-pointer">Send back</summary>
              <form action={sendBack} className="mt-[var(--space-2)] grid gap-[var(--space-2)]">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="next" value={next} />
                <label htmlFor={`why-${c.id}`} className="b-label">
                  Why is it sent back? {c.claimant} will read this.
                </label>
                <textarea id={`why-${c.id}`} name="reason" required rows={3} maxLength={500} className="textarea" />
                <div>
                  <SubmitOnce busy="Sending back…">Send it back</SubmitOnce>
                </div>
              </form>
            </details>
          </>
        ),
      })}
    />
  );
}
