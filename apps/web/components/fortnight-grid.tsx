import Link from "@/components/link";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Subject } from "./period-row";
import { StatusChip, type State } from "./status-chip";

/** A lesson as a block. `href`: where a plain click goes, the lesson's activity page (none when it has none: then the block is not a link and
 *  says nothing more). `pick`: the coordinator's click, choosing this block as the lesson to move or the one to swap it with; the activity link
 *  then sits on the block as its own small link. `picked`: this is the lesson chosen to move. `note`: the rule's words, when a clash is on it. */
export type FCell = { subject: Exclude<Subject, "fixed">; activity: string; href?: string; pick?: string; picked?: boolean; chip?: State; now?: boolean; moved?: boolean; clash?: boolean; note?: string };
/** A free slot (a lesson period with no lesson that day): offered only while a lesson is chosen to move, as a place to move it to. */
export type FSlot = { slot: string; label: string };
export type FRow = { band: string } | { time: string; cells: readonly (FCell | FSlot | null)[] };
const SUBJECT = { numeracy: "Numeracy", language: "Language", arts: "Arts" } as const;

/** Days across, periods down; each cell filled with its subject's tint, a 3 px top edge in the subject colour, the subject's
 *  icon and word and the activity; fixed parts of the day are full-width sand bands; today's head is the action colour;
 *  moved is a dashed amber outline plus the Moved chip; a clash a red outline plus the Clash chip and the rule's words. A chip on a
 *  cell sits on the panel colour with its ring. */
export function FortnightGrid({ days, today, rows, dayHrefs }: { days: readonly string[]; today?: string; rows: readonly FRow[]; /** a link for each day head, when the heads open their day */ dayHrefs?: readonly (string | undefined)[] }) {
  return (
    <div data-block="FortnightGrid" className="b-fgrid-box">
      <div className={days.length > 5 ? "b-fgrid b-many" : "b-fgrid"} style={{ "--cols": days.length } as React.CSSProperties}>
        <span />
        {days.map((d, i) =>
          dayHrefs?.[i] ? (
            <Link key={d} href={dayHrefs[i]!} className="b-dh" aria-current={d === today ? "date" : undefined}>{d}</Link>
          ) : (
            <span key={d} className="b-dh" aria-current={d === today ? "date" : undefined}>{d}</span>
          ),
        )}
        {rows.map((r, i) =>
          "band" in r ? (
            <span key={i} className="b-band"><Icon name="break" size={ICON_SIZE.table} />{r.band}</span>
          ) : (
            [
              <span key={`${i}t`} className="b-tm">{r.time}</span>,
              ...r.cells.map((c, j) =>
                !c ? (
                  <span key={`${i}-${j}`} />
                ) : "slot" in c ? (
                  <Link key={`${i}-${j}`} href={c.slot} className="b-slot" data-slot>{c.label}</Link>
                ) : (
                  <Cell key={`${i}-${j}`} c={c} />
                ),
              ),
            ]
          ),
        )}
      </div>
    </div>
  );
}

function Cell({ c }: { c: FCell }) {
  const cls = `b-cell${c.moved ? " b-moved" : ""}${c.clash ? " b-clash" : ""}${c.picked ? " b-picked" : ""}`;
  // a clash says so on the block, and a move by hand says so; a lesson in progress, done or late says that
  const chip: State | undefined = c.clash ? "clash" : c.moved ? "moved" : c.chip;
  const inside = (
    <>
      <span className="b-subj"><Icon name={c.subject} size={ICON_SIZE.table} />{SUBJECT[c.subject]}</span>
      <b>{c.activity}</b>
      {chip ? <StatusChip state={chip} words={c.clash ? "Clash" : c.moved ? "Moved" : undefined} onTint round /> : null}
      {c.note ? <small className="b-note" data-clash-note>{c.note}</small> : null}
    </>
  );
  const common = { "data-subject": c.subject, "aria-current": c.now ? ("time" as const) : undefined };
  if (c.pick)
    return (
      <div className="b-cell-w">
        <Link href={c.pick} className={cls} data-pick aria-pressed={c.picked ?? false} data-press {...common}>{inside}</Link>
        {c.href ? <Link href={c.href} className="b-open" data-activity-link>Activity</Link> : null}
      </div>
    );
  if (c.href) return <Link href={c.href} className={cls} data-press {...common}>{inside}</Link>;
  return <div className={cls} {...common}>{inside}</div>;
}
