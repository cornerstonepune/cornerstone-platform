import Link from "@/components/link";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Subject } from "./period-row";
import { StatusChip, type State } from "./status-chip";

export type FCell = { subject: Exclude<Subject, "fixed">; activity: string; href: string; chip?: State; now?: boolean; moved?: boolean; clash?: boolean };
export type FRow = { band: string } | { time: string; cells: readonly (FCell | null)[] };
const SUBJECT = { numeracy: "Numeracy", language: "Language", arts: "Arts" } as const;

/** Days across, periods down; each cell filled with its subject's tint, a 3 px top edge in the subject colour, the subject's
 *  icon and word and the activity; fixed parts of the day are full-width sand bands; today's head is the action colour;
 *  moved is a dashed amber outline plus the Moved chip; a clash a red outline plus the Clash chip. A chip on a cell sits
 *  on the panel colour with its ring. */
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
                c ? (
                  <Link key={`${i}-${j}`} href={c.href} className={`b-cell${c.moved ? " b-moved" : ""}${c.clash ? " b-clash" : ""}`} data-subject={c.subject} data-press aria-current={c.now ? "time" : undefined}>
                    <span className="b-subj"><Icon name={c.subject} size={ICON_SIZE.table} />{SUBJECT[c.subject]}</span>
                    <b>{c.activity}</b>
                    {c.chip ? <StatusChip state={c.chip} onTint round /> : null}
                  </Link>
                ) : <span key={`${i}-${j}`} />,
              ),
            ]
          ),
        )}
      </div>
    </div>
  );
}
