import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { Rail } from "@/components/app-frame";
import { ChildrenTable, type Section } from "@/components/children/children-table";
import { PeekPanel, PeekProvider } from "@/components/children/peek";
import { EmptyState } from "@/components/empty-state";
import { FilterBar, type Filter } from "@/components/filter-bar";
import { requireStaff } from "@/lib/auth";
import { ATTENTION_DAYS, childrenTable } from "@/lib/children-reads";
import { GROUPS, filterRows, groupRows, byRoll, type Group } from "@/lib/children-view";
import { TABLE_ROW_LIMIT } from "@/lib/ux-rules";

type Q = { q?: string; cls?: string; show?: string; group?: string; page?: string };

// Children (UI-3b): the educator's own children in one table, or every class for the coordinator. The filters, the grouping and
// the page are all in the address, so a reload keeps them. Groups are computed on each visit and never stored.
export default async function Children({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const t = await childrenTable({ ...me, email: me.email });
  const group = (GROUPS as readonly string[]).includes(sp.group ?? "") ? (sp.group as Group) : undefined;
  const several = t.classes.length > 1;
  const f = { q: sp.q?.trim() || undefined, cls: t.classes.some((c) => c.id === sp.cls) ? sp.cls : undefined, show: sp.show === "attention" ? ("attention" as const) : undefined, group: group === "class" && !several ? undefined : group };
  const rows = filterRows(t.rows, f, t.today, ATTENTION_DAYS);
  const ordered = f.group ? groupRows(rows, f.group, t.today, ATTENTION_DAYS) : [{ key: "all", words: "All", rows: [...rows].sort(byRoll) }];
  const flat = ordered.flatMap((g) => g.rows.map((r) => ({ g: g.key, r })));
  const pages = Math.max(1, Math.ceil(flat.length / TABLE_ROW_LIMIT));
  const n = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const slice = flat.slice((n - 1) * TABLE_ROW_LIMIT, n * TABLE_ROW_LIMIT);
  // every group keeps its heading and its total on every page, so the counts always sum to the rows; a group whose children
  // are all on another page says so
  const sections: Section[] = ordered.map((g) => ({ key: g.key, words: g.words, total: g.rows.length, rows: slice.filter((x) => x.g === g.key).map((x) => x.r) }));
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, cls: f.cls, show: f.show, group: f.group, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/children?${s}` : "/children";
  };
  const filters: Filter[] = [
    ...(several ? [{ name: "cls", label: "Class", value: f.cls, all: "All", options: t.classes.map((c) => [c.id, c.section] as const) }] : []),
    { name: "show", label: "Needs attention", value: f.show, all: "All", options: [["attention", "Needs attention"]] },
    { name: "group", label: "Group by", value: f.group, all: "None: one table in Sr. No. order", options: [...(several ? ([["class", "Class"]] as const) : []), ["doing", "How they are doing"], ["attention", "Needs attention"]] },
  ];
  const first = (f.cls ? t.classes.find((c) => c.id === f.cls) : t.classes[0])?.id;
  const everyone = me.role === "coordinator" || several;
  return (
    <PeekProvider>
      <Screen
        stage={`${everyone ? "All classes" : "Your class"} · ${t.rows.length} ${t.rows.length === 1 ? "child" : "children"}`}
        title="Children"
        purpose="Your children in one table: how each is doing, last seen, notes waiting. Search, filter, open a child."
        action={first ? <Link href={`/children/${first}`} className="btn secondary">Class picture grid</Link> : <span />}
        next={{ href: first ? `/children/${first}` : "/today", label: first ? "The class picture" : "Today" }}
        rail={<ChildrenRail />}
      >
        {t.rows.length === 0 ? (
          <EmptyState>No class linked to you. The coordinator links you to the classes you teach.</EmptyState>
        ) : (
          <>
            <FilterBar action="/children" filters={filters} search={{ name: "q", value: f.q, placeholder: "Name or Sr. No.", label: "Search by name or Sr. No." }} />
            {rows.length === 0 ? (
              <EmptyState>No child matches. Check the spelling, or <Link href="/children">Clear</Link> the filters.</EmptyState>
            ) : (
              <ChildrenTable sections={sections} grouped={Boolean(f.group)} showClass={several} today={t.today} page={{ n, pages }} hrefOf={Object.fromEntries(Array.from({ length: pages }, (_, i) => [i + 1, href({ page: String(i + 1) })]))} />
            )}
          </>
        )}
      </Screen>
    </PeekProvider>
  );
}

function ChildrenRail() {
  return (
    <div className="grid content-start gap-[var(--space-3)]">
      <PeekPanel />
      <Rail edges={[{ screen: "assessments", label: "Assessments", icon: "assessment" }, { screen: "notes", label: "Notes", icon: "note" }]} />
    </div>
  );
}
