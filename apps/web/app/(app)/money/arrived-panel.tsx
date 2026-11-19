import type { ReactNode } from "react";
import type { PanelTab } from "@/components/detail-panel";
import type { Arrived } from "@/lib/arrived-words";
import { dayWords } from "@/lib/money-claims";
import type { Got } from "@/lib/money-queue";
import { qty } from "@/lib/stock-words";
import { ArrivedForm } from "./arrived-form";

// What arrived, in a claim's panel (CP-86): for a keeper of the claim's campus, "Record what arrived" among the claim's actions and an Arrived tab that reads what has
// been recorded against it, item by item with the day. Everyone else gets neither: the engine says who keeps the store, and `arrived` is null for a person who keeps none.
export function arrivedPanel(claim: string, arrived: Got<Arrived> | null | undefined): { actions: ReactNode; tab: PanelTab | null } {
  if (!arrived) return { actions: null, tab: null };
  if (!arrived.ok) return { actions: null, tab: { key: "arrived", label: "Arrived", body: <p className="b-muted" data-arrived-said>{arrived.words}</p> } };
  const { moves, can_record } = arrived.value;
  return {
    actions: can_record ? <ArrivedForm claim={claim} again={moves.length > 0} /> : null,
    tab: {
      key: "arrived",
      label: "Arrived",
      body: moves.length ? (
        <ul className="grid gap-[var(--space-2)]" data-arrived>
          {moves.map((m, i) => (
            <li key={i} data-arrived-move={m.material_code} className="flex items-baseline justify-between gap-[var(--space-2)]">
              <span className="min-w-0">
                <b className="[overflow-wrap:anywhere]">{m.item}</b>
                <span className="b-muted b-label block">
                  {dayWords(m.on)} · {m.by}
                </span>
              </span>
              <span className="b-num whitespace-nowrap">
                {qty(m.quantity)} {m.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="b-muted">Nothing has been recorded against this claim yet.</p>
      ),
    },
  };
}
