import type { Opened } from "@/components/detail-panel";
import { KeyValue } from "@/components/key-value";
import { StatusChip } from "@/components/status-chip";
import { dayWords } from "@/lib/money-queue";
import { stockAt, qty, WORD_STATE, type Move, type StockItem } from "@/lib/stock-words";
import { StockForm } from "./stock-form";

// An item opened on the right (CP-82): where it stands in words, the four things a keeper does to it, and its history. The engine's words are shown as sent.
type Props = { item: StockItem; campus: string; kept: readonly string[]; moves: Move[] | null; classes: string[]; claims: { id: string; label: string }[]; reasons: string[]; q?: string };

export function itemPanel({ item, campus, kept, moves, classes, claims, reasons, q }: Props): Opened {
  const form = (kind: "in" | "out" | "minimum" | "writeoff") => <StockForm key={kind} kind={kind} campus={campus} code={item.code} unit={item.unit} classes={classes} claims={claims} reasons={reasons} />;
  return {
    key: `item:${item.code}`,
    kind: "activity",
    icon: "materials",
    title: item.name,
    line: `${qty(item.on_hand)} ${item.unit} on hand`,
    closeHref: stockAt("/stock", { campus: kept.length > 1 ? campus : undefined, q }),
    lead: (
      <p className="flex flex-wrap items-baseline gap-[var(--space-1)]" data-item-standing>
        <StatusChip state={WORD_STATE[item.word]} words={item.word} compact />
        <span className="b-muted">{item.minimum === null ? "No minimum set." : `Minimum ${qty(item.minimum)} ${item.unit}.`}</span>
      </p>
    ),
    actions: (
      <>
        {form("in")}
        {form("out")}
        {form("minimum")}
        {form("writeoff")}
      </>
    ),
    tabs: [
      {
        key: "details",
        label: "Details",
        body: (
          <KeyValue
            rows={[
              { label: "On hand", value: `${qty(item.on_hand)} ${item.unit}`, num: true },
              { label: "Minimum", value: item.minimum === null ? "None set" : `${qty(item.minimum)} ${item.unit}`, num: true },
              { label: "Where", value: campus },
            ]}
          />
        ),
      },
      {
        key: "history",
        label: "History",
        body: moves === null ? (
          <p className="b-muted">The history could not be read just now.</p>
        ) : moves.length ? (
          <ul className="grid gap-[var(--space-2)]" data-history>
            {moves.map((m, i) => (
              <li key={i}>
                <span className="b-muted b-label block">
                  {dayWords(m.on)} · {m.by}
                </span>
                {m.words}
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">Nothing has been recorded for this item yet.</p>
        ),
      },
    ],
  };
}
