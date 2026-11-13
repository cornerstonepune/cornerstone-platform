import Link from "@/components/link";
import type { Opened } from "@/components/detail-panel";
import { BTN, FIELD, type DayLine } from "@/components/educator/materials-table";
import { ToConfirm } from "@/components/educator/to-confirm";
import { KeyValue } from "@/components/key-value";
import { Icon } from "@/lib/icons";
import { screenHref } from "@/lib/built";
import type { MaterialLine } from "@/lib/educator/types";
import { E } from "@/lib/educator/words";
import { removeLine, setQuantity } from "@/app/(app)/educator/materials/actions";

// A materials line in the right panel (page charter C, "Materials": the list by day on the left, a line's detail on the right). Tab "How
// many": the quantity (never guessed: none is "to confirm"), where it is kept, where the line came from, the day it is needed; she sets
// the quantity or removes the line here (the engine's /materials/line/quantity and /remove, kept with who). Tab "Activity": the activity
// that needs it, a link to it, and what else that activity needs in the days shown. A previewer reads the same and changes nothing.
const W = E.materials;
const SOURCE = { school: "The school's plan", educator: "Added by the educator" } as const;

export const qty = (l: { quantity: number | null; unit: string }) => (l.quantity === null ? W.noQty : `${l.quantity} ${l.unit}`);
export const activityHref = (code: string) => screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}?back=/timetable/materials`;
const kept = (l: MaterialLine) => (!l.tracked || !l.home ? "none" : l.home);

export function linePanel(l: DayLine, all: readonly DayLine[], o: { closeHref: string; tab?: string; look: boolean }): Opened {
  const same = l.activity ? all.filter((x) => x.activity?.code === l.activity!.code && x.line_id !== l.line_id) : [];
  const howMany = (
    <>
      {o.look ? (
        <p className="tabular-nums" data-line-quantity>
          {qty(l)}
        </p>
      ) : (
        <form action={setQuantity} className="flex flex-wrap items-center gap-[var(--space-1)]" aria-label={`${W.cols.quantity}: ${l.item}`} data-quantity-form>
          <input type="hidden" name="line" value={l.line_id} />
          <label className="grid gap-[var(--space-1)]">
            <span className="b-label b-muted">{W.cols.quantity}</span>
            <span className="flex items-center gap-[var(--space-1)]">
              <input name="quantity" type="number" min={0} step="any" defaultValue={l.quantity ?? ""} placeholder={W.noQty} className={`${FIELD} w-[var(--space-7)] tabular-nums`} />
              <span className="b-label b-muted">{l.unit}</span>
            </span>
          </label>
          <button type="submit" className={`${BTN} self-end`}>
            {W.save}
          </button>
        </form>
      )}
      {l.quantity === null ? <ToConfirm /> : null}
      <KeyValue
        rows={[
          { label: "Needed on", value: l.day },
          { label: W.cols.home, value: <span data-home={kept(l)}>{W.home[kept(l)]}</span> },
          { label: "Source", value: SOURCE[l.source] },
        ]}
      />
      {o.look ? null : (
        <form action={removeLine}>
          <input type="hidden" name="line" value={l.line_id} />
          <button type="submit" className={BTN} aria-label={`${W.remove}: ${l.item}`}>
            <Icon name="clear" size={16} />
            {W.remove}
          </button>
        </form>
      )}
    </>
  );
  const activity = l.activity ? (
    <>
      <p>
        <Link href={activityHref(l.activity.code)} data-line-activity className="inline-flex min-h-[var(--tap)] items-center">
          {l.activity.name}
        </Link>
      </p>
      {same.length ? (
        <section aria-label="The same activity also needs" className="grid gap-[var(--space-1)]">
          <h3 className="b-label b-muted">It also needs, in these days</h3>
          <ul className="list-disc pl-[var(--space-4)]">
            {same.map((x) => (
              <li key={x.line_id}>
                {x.item} · {qty(x)} · {x.day}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  ) : (
    <p className="tt-note">Added by the educator: no activity in the plan asks for it.</p>
  );
  return {
    key: `line:${l.line_id}`,
    kind: "activity",
    title: l.item,
    line: `${l.day} · ${l.quantity === null ? W.toConfirm : qty(l)}`,
    closeHref: o.closeHref,
    tabs: [
      { key: "line", label: "How many", body: howMany },
      { key: "activity", label: "Activity", body: activity },
    ],
    tab: o.tab,
  };
}
