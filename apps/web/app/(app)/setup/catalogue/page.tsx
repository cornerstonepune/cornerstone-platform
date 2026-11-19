import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KindTile } from "@/components/kind-tile";
import Link from "@/components/link";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { commonWords, searchItems } from "@/lib/catalogue-data";
import { catalogueAt, countOf, groupName, needsFirst, NEEDS, NEEDS_VALUE, type Group, type Item } from "@/lib/catalogue-words";
import type { Column } from "@/lib/ux-rules";
import { CategoryForm } from "./category-form";
import { TeachWord } from "./teach-word";

// The Catalogue (CP-84b, specs/CP-84b/spec.md): the one list of materials, every item under its category with the ones that need a category first, a search, and each
// item's unit and approved words. A coordinator or above changes an item's category and teaches a word its category (every uncategorised item ending in it takes it);
// everyone else reads the same list. The engine says who may and which items match; ten items of a group at a time, the rest behind "Show all".
type Q = { q?: string; category?: string; page?: string };
const PURPOSE = "Every material the school uses, by category.";
const LIMIT = 10;

function Heading({ group, count }: { group: Group; count: number }) {
  return (
    <h2 className="flex flex-wrap items-center gap-[var(--space-2)] font-semibold" data-group-heading>
      {group.category === null ? (
        <StatusChip state="toConfirm" words="needs a category" compact />
      ) : (
        <>
          <KindTile kind="activity" icon="materials" />
          {group.category}
        </>
      )}
      <span className="b-muted b-label b-num">
        {count.toLocaleString("en-IN")} {count === 1 ? "item" : "items"}
      </span>
    </h2>
  );
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const asked = (q.q ?? "").trim();
  const got = await searchItems(me.email, asked);
  if (!got.ok)
    return (
      <Screen stage="Setup" title="Catalogue" purpose={PURPOSE} next={{ href: "/setup", label: "Setup" }}>
        <EmptyState>{got.words}</EmptyState>
      </Screen>
    );
  const { can, categories } = got.value;
  const groups = needsFirst(got.value.groups);
  const chosen = q.category === NEEDS_VALUE ? null : q.category && categories.includes(q.category) ? q.category : undefined;
  const shown = chosen === undefined ? groups : groups.filter((g) => g.category === chosen);
  const words = can.categorise ? await commonWords(me.email) : null;
  const needs = groups.find((g) => g.category === null)?.items.length ?? 0;
  const used = groups.filter((g) => g.category !== null).length;
  const stats = [
    { id: "items", n: countOf(groups), line: asked ? "found" : "items" },
    { id: "needs", n: needs, line: needs === 1 ? "needs a category" : "need a category", tone: "wait" as const },
    { id: "categories", n: used, line: used === 1 ? "category" : "categories" },
  ].filter((s) => s.n > 0);
  const columns = (): Column<Item>[] => [
    { key: "name", label: "Item", value: (i) => i.name, cell: (i) => <b className="[overflow-wrap:anywhere]">{i.name}</b> },
    { key: "unit", label: "Unit", width: "7rem", value: (i) => i.unit },
    { key: "words", label: "Approved words", width: "14rem", value: (i) => i.aliases.join(", ") },
    ...(can.categorise
      ? [{ key: "category", label: "Category", width: "22rem", keep: true, value: (i: Item) => i.category ?? NEEDS, cell: (i: Item) => <CategoryForm code={i.code} name={i.name} current={i.category} categories={categories} /> }]
      : []),
  ];
  const page = Math.max(1, Number(q.page) || 1);
  return (
    <Screen
      stage="Setup"
      title="Catalogue"
      purpose={PURPOSE}
      next={{ href: "/setup", label: "Setup" }}
      panel={stats.length ? <DetailPanel open={null} summary={{ title: "Catalogue", stats }} /> : undefined}
    >
      <FilterBar
        action="/setup/catalogue"
        filters={[{ name: "category", label: "Category", value: q.category && (q.category === NEEDS_VALUE || chosen) ? q.category : undefined, all: "Every category", options: [[NEEDS_VALUE, NEEDS], ...categories.map((c) => [c, c] as const)] }]}
        search={{ name: "q", value: asked || undefined, placeholder: "Find an item", label: "Find an item" }}
        wrap
      />
      {words?.ok && words.value.length ? <TeachWord words={words.value} categories={categories} /> : null}
      {!groups.length ? <EmptyState>{asked ? "No item has those words." : "The catalogue has no items yet."}</EmptyState> : null}
      {groups.length && !shown.length ? <EmptyState>No item is in that category.</EmptyState> : null}
      {shown.map((g) => {
        const only = chosen !== undefined;
        const rows = only ? g.items : g.items.slice(0, LIMIT);
        return (
          <section key={g.category ?? NEEDS_VALUE} aria-label={groupName(g.category)} data-group={groupName(g.category)} className="grid gap-[var(--space-2)]">
            <Heading group={g} count={g.items.length} />
            <DataTable
              label={groupName(g.category)}
              columns={columns()}
              rows={rows}
              rowKey={(i) => i.code}
              limit={LIMIT}
              more={{ page: only ? page : 1, href: (n: number) => catalogueAt({ q: asked, category: g.category ?? NEEDS_VALUE, page: n }) }}
            />
            {!only && g.items.length > LIMIT ? (
              <p className="b-label">
                <span className="b-muted b-num">{(g.items.length - LIMIT).toLocaleString("en-IN")} more</span>
                {" · "}
                <Link href={catalogueAt({ q: asked, category: g.category ?? NEEDS_VALUE })}>Show all →</Link>
              </p>
            ) : null}
          </section>
        );
      })}
    </Screen>
  );
}
