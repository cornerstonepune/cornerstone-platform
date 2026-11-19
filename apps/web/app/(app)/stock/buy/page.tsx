import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { StatusChip } from "@/components/status-chip";
import { schoolToday } from "@/lib/school-clock";
import { buyList } from "@/lib/stock-data";
import { monthChoices, qty, stockAt, type BuyLine } from "@/lib/stock-words";
import type { Column } from "@/lib/ux-rules";
import { keeper } from "../gate";

// Stock, Buy list (CP-82, specs/CP-82/spec.md): for a campus and a month, what its classes' lists need, less what the store holds, plus the top-up to the
// minimum, as the engine works it out. A need no class gave a quantity for is "to confirm", never a smaller number. Each line names the classes and activities
// it comes from, and "Send checklist" opens the same WhatsApp checklist the inventory person already gets. Ten lines a page.
const PURPOSE = "What the classes need, less what the store holds.";
type Q = { campus?: string; month?: string; page?: string };

/** The classes of a line, each with its activities: "3A  Sand play, Clay modelling". */
function From({ line }: { line: BuyLine }) {
  const byClass = new Map<string, string[]>();
  for (const s of line.sources) byClass.set(s.class, [...(byClass.get(s.class) ?? []), ...(s.activity ? [s.activity] : [])]);
  return (
    <ul className="grid gap-[var(--space-0)]" data-sources>
      {[...byClass].map(([cls, acts]) => (
        <li key={cls} className="[overflow-wrap:anywhere]">
          <b>{cls}</b>
          {acts.length ? <span className="b-muted"> {acts.join(", ")}</span> : null}
        </li>
      ))}
    </ul>
  );
}

const sayWithout = (labels: string[]) => `No materials list yet for ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? ` and ${labels.length - 4} more` : ""}.`;

export default async function BuyListPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const k = await keeper("Buy list", PURPOSE, q.campus);
  if ("refused" in k) return k.refused;
  const months = monthChoices(await schoolToday());
  const month = months.find(([m]) => m === q.month)?.[0] ?? months[1][0];
  const got = await buyList(k.me.email, k.campus, month);
  const keep = { campus: k.kept.length > 1 ? k.campus : undefined, month: month === months[1][0] ? undefined : month };
  const columns: Column<BuyLine>[] = [
    { key: "item", label: "Item", value: (l) => l.name, cell: (l) => <b className="[overflow-wrap:anywhere]">{l.name}</b> },
    { key: "need", label: "Need", num: true, width: "6rem", value: (l) => l.need, cell: (l) => (l.need === null ? "—" : `${qty(l.need)} ${l.unit}`) },
    { key: "hand", label: "On hand", num: true, width: "6rem", value: (l) => l.on_hand, cell: (l) => `${qty(l.on_hand)} ${l.unit}` },
    { key: "minimum", label: "Minimum", num: true, width: "6rem", value: (l) => l.minimum, cell: (l) => (l.minimum === null ? "—" : `${qty(l.minimum)} ${l.unit}`) },
    { key: "buy", label: "To buy", num: true, width: "8rem", keep: true, value: (l) => (l.to_buy === null ? "to confirm" : l.to_buy), cell: (l) => (l.to_buy === null ? <StatusChip state="toConfirm" compact /> : <b data-to-buy>{`${qty(l.to_buy)} ${l.unit}`}</b>) },
    { key: "from", label: "Classes and activities", value: (l) => l.sources.length, cell: (l) => <From line={l} /> },
  ];
  const checklist = got.ok ? got.value.checklist_url : null;
  return (
    <Screen
      stage="Stock"
      title="Buy list"
      purpose={PURPOSE}
      action={
        checklist ? (
          <a href={checklist} target="_blank" rel="noreferrer" className="btn" data-send-checklist>
            Send checklist
          </a>
        ) : undefined
      }
      next={{ href: "/stock", label: "On hand" }}
    >
      <FilterBar
        action="/stock/buy"
        filters={[
          ...(k.kept.length > 1 ? [{ name: "campus", label: "Campus", value: k.campus, required: true, all: "", options: k.kept.map((c) => [c, c] as const) }] : []),
          { name: "month", label: "Month", value: month, required: true, all: "", options: months },
        ]}
      />
      {!got.ok ? <EmptyState>{got.words}</EmptyState> : null}
      {got.ok && !got.value.lines.length ? <EmptyState>Nothing needs buying for this month.</EmptyState> : null}
      {got.ok && got.value.lines.length ? (
        <DataTable label="Buy list" columns={columns} rows={got.value.lines} rowKey={(l) => l.code} extras={{ attrs: (l) => ({ "data-line": l.code, "data-to-confirm": l.to_buy === null ? "yes" : "no" }) }} more={{ page: Number(q.page) || 1, href: (p: number) => stockAt("/stock/buy", { ...keep, page: String(p) }) }} />
      ) : null}
      {got.ok && got.value.classes_without_list.length ? (
        <p className="b-muted" data-without-list>
          {sayWithout(got.value.classes_without_list)}
        </p>
      ) : null}
    </Screen>
  );
}
