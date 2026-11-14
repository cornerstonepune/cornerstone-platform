import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DetailPanel } from "@/components/detail-panel";
import type { Stat } from "@/components/stat-tile";
import { Cards } from "@/components/cards";
import { StackBar } from "@/components/stack-bar";
import { PeekChip } from "@/components/children/peek";
import { ChildrenTable, ClassCountsLine, type Section } from "@/components/children/children-table";
import { PeekProvider, PeekSheet } from "@/components/children/peek";
import { EmptyState } from "@/components/empty-state";
import { FilterBar, type Filter } from "@/components/filter-bar";
import { SwitchedOff } from "@/components/children/switched-off";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { screensOn, childrenTable, latestNotes, type LatestNote } from "@/lib/children-reads";
import { GROUPS, filterRows, groupRows, byRoll, needsAttention, peekParam, type Group } from "@/lib/children-view";
import { PRACTISING, SECURE, UNSEEN, stateOf } from "@/lib/looks";
import { TABLE_ROW_LIMIT } from "@/lib/ux-rules";

type Q = { q?: string; cls?: string; show?: string; group?: string; page?: string; peek?: string };

// Children (UI-3b): the educator's own children in one table, or every class for the coordinator. The filters, the grouping and
// the page are all in the address, so a reload keeps them. Groups are computed on each visit and never stored.
export default async function Children({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  if (!(await screensOn())) return <SwitchedOff title="Children" stage="Children" />;
  const sp = await searchParams;
  const t = await childrenTable({ ...me, email: me.email });
  // grouped by how they are doing unless the person chose another grouping, or "None": one table in Sr. No. order
  const group = sp.group === "none" ? undefined : (GROUPS as readonly string[]).includes(sp.group ?? "") ? (sp.group as Group) : "doing";
  const several = t.classes.length > 1;
  const f = { q: sp.q?.trim() || undefined, cls: t.classes.some((c) => c.id === sp.cls) ? sp.cls : undefined, show: sp.show === "attention" ? ("attention" as const) : undefined, group: group === "class" && !several ? undefined : group };
  const rows = filterRows(t.rows, f, t.today, t.days);
  const ordered = f.group ? groupRows(rows, f.group, t.today, t.days) : [{ key: "all", words: "All", rows: [...rows].sort(byRoll) }];
  const flat = ordered.flatMap((g) => g.rows.map((r) => ({ g: g.key, r })));
  const pages = Math.max(1, Math.ceil(flat.length / TABLE_ROW_LIMIT));
  const n = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const slice = flat.slice((n - 1) * TABLE_ROW_LIMIT, n * TABLE_ROW_LIMIT);
  // every group keeps its heading and its total on every page, so the counts always sum to the rows; a group whose children
  // are all on another page says so
  const sections: Section[] = ordered.map((g) => ({ key: g.key, words: g.words, total: g.rows.length, rows: slice.filter((x) => x.g === g.key).map((x) => x.r) }));
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, cls: f.cls, show: f.show, group: sp.group, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/children?${s}` : "/children";
  };
  const filters: Filter[] = [
    ...(several ? [{ name: "cls", label: "Class", value: f.cls, all: "All", options: t.classes.map((c) => [c.id, c.section] as const) }] : []),
    { name: "show", label: "Needs attention", value: f.show, all: "All", options: [["attention", "Needs attention"]] },
    // the grouping is in the address only when the person chose one: the default (how they are doing) is the first option, so Clear,
    // which keeps a required choice, lands on /children itself and not on /children?group=doing
    { name: "group", label: "Group by", value: sp.group === "none" ? "none" : f.group === "doing" ? undefined : f.group, all: "", required: true, options: [["doing", "How they are doing"], ["none", "None: one table in Sr. No. order"], ...(several ? ([["class", "Class"]] as const) : []), ["attention", "Needs attention"]] },
  ];
  const open = t.rows.find((r) => peekParam(r) === sp.peek);
  const initial = open ? { classId: open.classId, roll: open.roll, name: open.name, section: open.section, counts: open.counts } : null;
  const first = (f.cls ? t.classes.find((c) => c.id === f.cls) : t.classes[0])?.id;
  const everyone = me.role === "coordinator" || several;
  // a class's header counts show when one class is in view: chosen in the filter, or the person's only class
  const oneClass = f.cls ? t.classes.find((c) => c.id === f.cls) : t.classes.length === 1 ? t.classes[0] : undefined;
  const notes = await latestNotes({ ...me, email: me.email }, t.classes.filter((c) => me.classes?.includes(c.section)).map((c) => c.id));
  // the whole class, all skills: every child on every skill, in whole counts (a sum over the children in view, never a score)
  const total = rows.reduce((a, r) => ({ secure: a.secure + r.counts.secure, practising: a.practising + r.counts.practising, unseen: a.unseen + r.counts.unseen }), { secure: 0, practising: 0, unseen: 0 });
  const attention = rows.filter((r) => needsAttention(r, t.today, t.days)).sort(byRoll);
  const cards = [
    {
      kind: "child" as const,
      title: "The whole class, all skills",
      body: (
        <>
          <StackBar parts={[{ state: stateOf(SECURE), n: total.secure }, { state: stateOf(PRACTISING), n: total.practising }, { state: stateOf(UNSEEN), n: total.unseen }]} />
          <span className="b-caption">Every child on every skill. Not seen yet is an enrolled child with no state on a skill.</span>
        </>
      ),
    },
    {
      kind: "child" as const,
      title: `Needing attention · ${attention.length}`,
      body:
        attention.length === 0 ? (
          <span className="b-muted">Nobody has gone unseen for two weeks or more.</span>
        ) : (
          <>
            <ul className="b-nchips" data-attention-list>
              {attention.slice(0, 12).map((r) => (
                <li key={r.childId}>
                  <PeekChip child={{ classId: r.classId, roll: r.roll, name: r.name, section: r.section, counts: r.counts }} />
                </li>
              ))}
            </ul>
            <span className="b-caption">Not seen for two weeks or more</span>
          </>
        ),
    },
    {
      kind: "child" as const,
      title: notes ? `Latest notes · ${notes.toConfirm} to confirm` : "Where this page leads",
      body: <LatestNotes notes={notes} />,
    },
  ];
  // the page's few numbers, plain counts (the filter, the sidebar and the card under the table are where they lead), a band under the title across the page (page charter A2: nothing chosen, no right column)
  // of the class in view when one is, else of every class shown, so the band never disagrees with the class line under it
  const sum = (k: "answers" | "reports") => (oneClass ? [oneClass] : t.classes).reduce((a, c) => a + (t.counts[c.id]?.[k] ?? 0), 0);
  const stats: Stat[] = [
    { n: rows.length, line: rows.length === 1 ? "child in view" : "children in view", id: "children" },
    { n: attention.length, line: "not seen for two weeks", tone: attention.length ? "act" : "ok", id: "attention" },
    ...(notes ? [{ n: notes.toConfirm, line: "notes to confirm", tone: notes.toConfirm ? ("wait" as const) : ("ok" as const), id: "notes" }] : []),
    { n: sum("answers"), line: "answers to check", tone: sum("answers") ? "wait" : "ok", id: "answers" },
    { n: sum("reports"), line: "parent reports waiting", tone: sum("reports") ? "wait" : "ok", id: "reports" },
  ];
  return (
    <PeekProvider initial={initial}>
      <Screen
        stage={`${everyone ? "All classes" : "Your class"} · ${t.rows.length} ${t.rows.length === 1 ? "child" : "children"}`}
        title="Children"
        purpose="Your children in one table: how each is doing, last seen, notes waiting. Search, filter, open a child."
        action={first ? <Link href={`/children/${first}`} className="btn secondary">Class picture grid</Link> : <span />}
        next={{ href: first ? `/children/${first}` : "/today", label: first ? "The class picture" : "Today" }}
        panel={t.rows.length ? <DetailPanel summary={{ title: "Your children at a glance", stats, after: rows.length > 0 ? <Cards cards={cards} /> : undefined }} /> : undefined}
      >
        {t.rows.length === 0 ? (
          <EmptyState>No class linked to you. The coordinator links you to the classes you teach.</EmptyState>
        ) : (
          <>
            <FilterBar action="/children" filters={filters} search={{ name: "q", value: f.q, placeholder: "Name or Sr. No.", label: "Search by name or Sr. No." }} />
            {f.group === "doing" ? <p className="b-caption">Grouped by how they are doing. With &ldquo;None&rdquo;, the same rows sit in one table, in Sr. No. order, with no headings.</p> : null}
            {oneClass ? <ClassCountsLine section={oneClass.section} counts={t.counts[oneClass.id] ?? { answers: 0, reports: 0 }} reportsHref={`/children/reports?class=${encodeURIComponent(oneClass.section)}`} /> : null}
            {rows.length === 0 ? (
              <EmptyState>No child matches. Check the spelling, or <Link href="/children">Clear</Link> the filters.</EmptyState>
            ) : (
              <ChildrenTable sections={sections} grouped={Boolean(f.group)} showClass={several && !f.cls} today={t.today} page={{ n, pages }} hrefOf={Object.fromEntries(Array.from({ length: pages }, (_, i) => [i + 1, href({ page: String(i + 1) })]))} />
            )}
          </>
        )}
      </Screen>
      <PeekSheet />
    </PeekProvider>
  );
}

/** The latest notes on any child, the count to confirm beside Notes, and where this page leads: a card under the table, not a rail
 *  (14 Nov 2026: the right column was empty space and cut the table off). */
function LatestNotes({ notes }: { notes: { toConfirm: number; latest: LatestNote[] } | null }) {
  const notesHref = screenHref("notes");
  const assessments = screenHref("assessments") ?? "/papers";
  return (
    <section aria-label="Latest notes, any child" data-latest-notes className="grid gap-[var(--space-2)]">
      {notes ? (
        <>
          <p data-notes-count className="text-[length:var(--text-label)]">
            {notesHref ? <Link href={notesHref}>Notes</Link> : "Notes"} · {notes.toConfirm} to confirm
          </p>
          {notes.latest.length > 0 ? (
            <ul className="grid gap-[var(--space-2)]">
              {notes.latest.slice(0, 4).map((n) => (
                <li key={n.id} className="text-[length:var(--text-label)]">
                  <b>{n.who}</b> · {n.state === "to_confirm" ? "to confirm" : "confirmed"}
                  <br />
                  <span className="b-muted">
                    {n.how}
                    {n.by ? ` · ${n.by}` : ""} · {n.at}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="b-muted text-[length:var(--text-label)]">No note has come in yet.</p>
          )}
        </>
      ) : null}
      <p className="flex flex-wrap gap-[var(--space-2)] text-[length:var(--text-label)]" data-page-links>
        <Link href={assessments} className="chip">Assessments</Link>
        {!notes && notesHref ? <Link href={notesHref} className="chip">Notes</Link> : null}
      </p>
    </section>
  );
}
