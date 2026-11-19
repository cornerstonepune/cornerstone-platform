import { Screen } from "@/components/app-frame";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { onHand } from "@/lib/stock-data";
import { keeper } from "../gate";
import { CountForm } from "./count-form";

// Stock, Count (CP-82): the termly count, a phone-gate screen. One line per item with what the books say; the keeper types what she sees, a reason field
// opens for a difference the engine says needs one, and the count is sent once, all lines together. Nothing is saved unless every line is accepted.
const PURPOSE = "Type what you see on the shelf, item by item.";

export default async function Count({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const q = await searchParams;
  const k = await keeper("Count", PURPOSE, q.campus);
  if ("refused" in k) return k.refused;
  const got = await onHand(k.me.email, k.campus);
  return (
    <Screen stage="Stock" title="Count" purpose={PURPOSE} next={{ href: "/stock", label: "On hand" }}>
      {k.kept.length > 1 ? <FilterBar action="/stock/count" filters={[{ name: "campus", label: "Campus", value: k.campus, required: true, all: "", options: k.kept.map((c) => [c, c] as const) }]} /> : null}
      {!got.ok ? <EmptyState>{got.words}</EmptyState> : null}
      {got.ok && !got.value.items.length ? <EmptyState>Nothing is in the store to count yet.</EmptyState> : null}
      {got.ok && got.value.items.length ? <CountForm key={k.campus} campus={k.campus} items={got.value.items} reasons={k.reasons.count} /> : null}
    </Screen>
  );
}
