import { requireStaff } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { parseOpen } from "@/components/detail-panel";
import { moneyAccess, moneyQueue } from "@/lib/money-queue";
import { arrivedOf } from "@/lib/stock-arrived";
import { schoolToday } from "@/lib/school-clock";
import { ClaimQueue, type Q } from "../claim-queue";
import { NotForYou } from "@/components/not-for-you";
import { SubmitOnce } from "../submit-once";
import { markPaid } from "./actions";

// To pay (CP-80, specs/CP-80/spec.md): approved claims the founders pay, oldest first. A claim opens with its amount large and Mark paid, which asks the date
// (today), how it was paid and the reference; after it the next claim opens by itself. Only for a person who may pay.
const MODES = ["UPI", "Cash", "Bank transfer"] as const;

export default async function ToPay({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const [access, queue, q, today] = await Promise.all([moneyAccess(me), moneyQueue(me), searchParams, schoolToday()]);
  if (access.ok && !access.value.can.pay) return <NotForYou stage="Money" title="To pay" who="the founders" back={{ href: "/money", label: "Back to My claims" }} />;
  if (!access.ok || !queue.ok)
    return (
      <Screen stage="Money" title="To pay" purpose="Approved claims waiting for payment." next={{ href: "/money", label: "My claims" }}>
        <EmptyState>{access.ok ? (queue.ok ? "" : queue.words) : access.words}</EmptyState>
      </Screen>
    );
  const chosen = parseOpen(q.open);
  const open = chosen?.kind === "claim" ? queue.value.pay.find((c) => c.id === chosen.id) : undefined;
  return (
    <ClaimQueue
      queue="pay"
      claims={queue.value.pay}
      q={q}
      arrived={open ? await arrivedOf(me, open) : null}
      work={(c, next) => ({
        actions: (
          <form action={markPaid} className="grid w-full gap-[var(--space-2)]" data-mark-paid>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="next" value={next} />
            <label className="field">
              <span className="b-label">Paid on</span>
              <input type="date" name="paid_on" defaultValue={today} max={today} required className="input min-h-[var(--tap)]" />
            </label>
            <label className="field">
              <span className="b-label">How</span>
              <select name="mode" className="select min-h-[var(--tap)]">
                {MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="b-label">Reference</span>
              <input name="ref" required maxLength={80} placeholder="UTR or receipt number" autoComplete="off" className="input min-h-[var(--tap)]" />
            </label>
            <div>
              <SubmitOnce main busy="Saving…">
                Mark paid
              </SubmitOnce>
            </div>
          </form>
        ),
      })}
    />
  );
}
