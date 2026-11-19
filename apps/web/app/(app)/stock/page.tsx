import { Screen } from "@/components/app-frame";
import { Card } from "@/components/cards";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { StatusChip } from "@/components/status-chip";
import { myClaims } from "@/lib/money-claims";
import { dayWords } from "@/lib/money-queue";
import { rupees } from "@/lib/money-format";
import { classLabels, history, onHand } from "@/lib/stock-data";
import { qty, stockAt, WORD_STATE, type StockItem } from "@/lib/stock-words";
import { pageOf } from "@/lib/ux-rules";
import { requireStaff } from "@/lib/auth";
import { keeper } from "./gate";
import { itemPanel } from "./item-panel";
import { StockInAny } from "./stock-in-any";

// Stock, On hand (CP-82, specs/CP-82/spec.md): what the campus's store holds, the items below their minimum first, each with its word. An item opens in the panel
// beside the list (`?open=item:<code>`): its history in words and what a keeper does to it (stock in, hand out, set the minimum, write off). The engine says
// every number and every word; ten items a page.
type Q = { campus?: string; open?: string; q?: string; page?: string };
const PURPOSE = "What the store holds, and what is running low.";

function ItemCard({ it, href, open }: { it: StockItem; href: string; open: boolean }) {
  return (
    <li>
      <Card href={href} scroll={false} data-open-key={`item:${it.code}`} data-item={it.code} data-word={it.word} aria-current={open ? "true" : undefined} className="grid gap-[var(--space-1)] min-[701px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)] min-[701px]:items-center min-[701px]:gap-[var(--space-3)]">
        <span className="min-w-0">
          <b className="line-clamp-2 [overflow-wrap:anywhere]">{it.name}</b>
          <span className="b-muted b-label block">{it.minimum === null ? "No minimum set" : `Minimum ${qty(it.minimum)} ${it.unit}`}</span>
        </span>
        <span className="b-label">
          <StatusChip state={WORD_STATE[it.word]} words={it.word} compact />
        </span>
        <b className="b-num whitespace-nowrap min-[701px]:text-right" data-on-hand>
          {qty(it.on_hand)} {it.unit}
        </b>
      </Card>
    </li>
  );
}

export default async function OnHand({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const me = await requireStaff();
  const k = await keeper(me, "On hand", PURPOSE, q.campus);
  if ("refused" in k) return k.refused;
  const got = await onHand(k.me.email, k.campus);
  if (!got.ok)
    return (
      <Screen stage="Stock" title="On hand" purpose={PURPOSE} next={{ href: "/stock/buy", label: "Buy list" }}>
        <EmptyState>{got.words}</EmptyState>
      </Screen>
    );
  const asked = (q.q ?? "").trim().toLowerCase();
  const items = got.value.items.filter((i) => !asked || `${i.name} ${i.code}`.toLowerCase().includes(asked));
  const chosen = parseOpen(q.open);
  const opened = chosen?.kind === "item" ? got.value.items.find((i) => i.code === chosen.id) : undefined;
  const at = opened ? items.findIndex((i) => i.code === opened.code) : -1;
  const shown = pageOf(items, Number(q.page) || (at >= 0 ? Math.floor(at / 10) + 1 : 1));
  const [moves, classes, claims] = await Promise.all([opened ? history(k.me.email, k.campus, opened.code) : null, opened ? classLabels(k.campus) : [], myClaims(k.me)]);
  const keep = { campus: k.kept.length > 1 ? k.campus : undefined, q: asked ? q.q : undefined };
  const count = (w: StockItem["word"]) => got.value.items.filter((i) => i.word === w).length;
  const stats = [
    { id: "items", n: got.value.items.length, line: "items" },
    { id: "low", n: count("low"), line: "low", tone: "wait" as const },
    { id: "none", n: count("none"), line: "none", tone: "act" as const },
    { id: "count", n: count("count it"), line: "to count", tone: "wait" as const },
  ].filter((s) => s.n > 0);
  const claimOptions = (claims ?? []).filter((c) => c.status !== "withdrawn" && c.status !== "voided").slice(0, 25).map((c) => ({ id: c.id, label: `${c.vendor} · ${rupees(c.amount)} · ${dayWords(c.spent_on)}` }));
  return (
    <Screen
      stage="Stock"
      title="On hand"
      purpose={PURPOSE}
      next={{ href: "/stock/buy", label: "Buy list" }}
      // an empty store has nothing to put in a side panel: none is drawn, so no empty row doubles the gap above the list
      panel={!stats.length && !opened ? undefined : <DetailPanel open={opened ? itemPanel({ item: opened, campus: k.campus, kept: k.kept, moves: moves && moves.ok ? moves.value.moves : null, classes, claims: claimOptions, reasons: k.reasons.writeoff, q: keep.q }) : null} summary={{ title: "On hand", stats }} />}
    >
      {k.kept.length > 1 || got.value.items.length > 6 ? (
        <FilterBar
          action="/stock"
          filters={k.kept.length > 1 ? [{ name: "campus", label: "Campus", value: k.campus, required: true, all: "", options: k.kept.map((c) => [c, c] as const) }] : []}
          search={{ name: "q", value: q.q, placeholder: "Find an item", label: "Find an item" }}
        />
      ) : null}
      <StockInAny campus={k.campus} claims={claimOptions} />
      {!got.value.items.length ? <EmptyState>Nothing is in the store yet.</EmptyState> : null}
      {got.value.items.length && !items.length ? <EmptyState>No item has that name.</EmptyState> : null}
      {shown.rows.length ? (
        <section aria-label="On hand" className="grid gap-[var(--space-2)]" data-items>
          <ul className="grid gap-[var(--space-2)]">
            {shown.rows.map((it) => (
              <ItemCard key={it.code} it={it} href={stockAt("/stock", { ...keep, open: `item:${it.code}`, page: shown.page > 1 ? String(shown.page) : undefined })} open={it.code === opened?.code} />
            ))}
          </ul>
          {shown.pages > 1 ? (
            <nav aria-label="Pages of items" className="flex flex-wrap items-center gap-[var(--space-2)] b-label">
              {shown.page > 1 ? (
                <Link href={stockAt("/stock", { ...keep, page: shown.page > 2 ? String(shown.page - 1) : undefined })} className="b-btn">
                  Earlier
                </Link>
              ) : null}
              <span className="b-muted b-num">
                Items {(shown.page - 1) * 10 + 1}–{Math.min(shown.page * 10, items.length)} of {items.length.toLocaleString("en-IN")}
              </span>
              {shown.page < shown.pages ? (
                <Link href={stockAt("/stock", { ...keep, page: String(shown.page + 1) })} className="b-btn">
                  Later
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}
    </Screen>
  );
}
