import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { Clusters, PictureGrid, type Block, type Square } from "@/components/children/picture-grid";
import { PeekPanel, PeekProvider, type Chosen } from "@/components/children/peek";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { NotYours } from "@/components/not-yours";
import { Spark } from "@/components/spark";
import { STATES } from "@/components/status-chip";
import { StackBar } from "@/components/stack-bar";
import { SwitchedOff } from "@/components/children/switched-off";
import { ClassViews } from "@/components/children/class-views";
import { ViewToggle } from "@/components/kanban-board";
import { requireStaff } from "@/lib/auth";
import { screensOn, childrenTable } from "@/lib/children-reads";
import { ClassCountsLine } from "@/components/children/children-table";
import { pictureOf, type Look } from "@/lib/children-picture";
import { LOOK_ORDER, byRoll, clustersOf, daysSince, groupByLook, peekParam, type PictureLook } from "@/lib/children-view";
import { SECURE, UNSEEN, stateOf } from "@/lib/looks";

type Q = { skill?: string; domain?: string; group?: string; peek?: string; view?: string; topic?: string; subject?: string; kp?: string };

// The class picture (UI-3b): each square a child by Sr. No., shown on one skill at a time. A square a child has no state on is
// "not seen yet", which is not "not secure". The clusters are worked out here from the graph's rows, each child in as many as fit.
export default async function Picture({ params, searchParams }: { params: Promise<{ class: string }>; searchParams: Promise<Q> }) {
  const me = await requireStaff();
  if (!(await screensOn())) return <SwitchedOff title="Class picture" stage="Children" />;
  const { class: classId } = await params;
  const sp = await searchParams;
  const p = await pictureOf({ ...me, email: me.email }, classId);
  if (!p) return <NotYours what="This class" />;
  const views = [
    { key: "picture", label: "Picture", icon: "board" as const, href: `/children/${classId}` },
    { key: "topic", label: "By topic", icon: "table" as const, href: `/children/${classId}?view=topic` },
    { key: "matrix", label: "Matrix", icon: "table" as const, href: `/children/${classId}?view=matrix` },
  ];
  if (sp.view === "topic" || sp.view === "matrix") return <ClassViews me={me} classId={classId} section={p.section} count={p.kids.length} view={sp.view} q={sp as Record<string, string | undefined>} toggle={<ViewToggle current={sp.view} views={views} />} />;
  const domains = [...new Set(p.skills.map((s) => s.domain).filter(Boolean))].sort();
  const domain = domains.includes(sp.domain ?? "") ? sp.domain : undefined;
  const skills = p.skills.filter((s) => !domain || s.domain === domain);
  const skill = skills.find((s) => s.code === sp.skill) ?? skills[0];
  const grouped = sp.group !== "class";
  const kids = [...p.kids].sort(byRoll);
  const counts = (await childrenTable({ ...me, email: me.email })).counts[classId] ?? { answers: 0, reports: 0 };
  const stateOn = (id: string): Look | null => (skill ? (p.cells.get(id)?.get(skill.code)?.look ?? null) : null);
  const chosenOf = (k: (typeof kids)[number]): Chosen => {
    const row = p.cells.get(k.id);
    const c = { secure: 0, practising: 0, unseen: 0 };
    for (const cell of row?.values() ?? []) if (cell.look === SECURE) c.secure++;
      else c.practising++;
    c.unseen = Math.max(0, p.skills.length - c.secure - c.practising);
    return { classId, roll: k.roll, name: k.name, section: p.section, counts: c };
  };
  const squares: (Square & { id: string })[] = kids.map((k) => ({ ...chosenOf(k), id: k.id, look: stateOn(k.id) ?? UNSEEN, skill: skill?.name ?? "" }));
  const words = (l: PictureLook) => STATES[stateOf(l)].words;
  const blocks: Block[] = grouped ? groupByLook(squares).map((g) => ({ look: g.look, words: words(g.look)[0].toUpperCase() + words(g.look).slice(1), squares: g.cells })) : [{ look: SECURE, words: "Class", squares }];
  const parts = LOOK_ORDER.map((l) => ({ state: stateOf(l), n: squares.filter((s) => s.look === l).length }));
  const clusters = clustersOf(
    kids.map((k) => ({
      id: k.id,
      look: stateOn(k.id),
      readyNext: skill ? (p.next.get(skill.code) ?? []).some((n) => !p.cells.get(k.id)?.has(n)) : false,
      attention: !p.anySeen.get(k.id) || daysSince(p.anySeen.get(k.id)!, p.today) >= p.days,
    })),
  );
  const kidChosen = Object.fromEntries(kids.map((k) => [k.id, chosenOf(k)]));
  const open = squares.find((x) => peekParam(x) === sp.peek);
  const initial = open ? (({ classId: c, roll, name, section, counts }) => ({ classId: c, roll, name, section, counts }))(open) : null;
  const q = (over: Q) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ skill: skill?.code, domain, group: sp.group, ...over })) if (v) u.set(k, v);
    return `/children/${classId}${u.size ? `?${u}` : ""}`;
  };
  return (
    <PeekProvider initial={initial}>
      <Screen
        stage={`${p.section} · ${kids.length} children`}
        title="Class picture"
        purpose="Each square a child by Sr. No., shown on one skill at a time. Tap a child. Change the skill from the rail."
        action={<Link href="/children" className="btn secondary">Show as a table</Link>}
        next={{ href: kids[0] ? `/children/${classId}/${encodeURIComponent(kids[0].roll)}` : "/children", label: "A child" }}
        rail={
          <aside aria-label="Rail" data-rail className="grid content-start gap-[var(--space-3)]">
            <PeekPanel />
            <div className="grid gap-[var(--space-2)] rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
              <section aria-label="Show">
                <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">Show</h2>
                <ul className="grid gap-[var(--space-1)]">
                  {skills.map((s) => (
                    <li key={s.code}>
                      <Link href={q({ skill: s.code })} data-show aria-label={`Show: ${s.name}`} aria-current={s.code === skill?.code ? "true" : undefined} className="flex min-h-[var(--tap)] items-center text-[var(--link)] underline">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              {kids[0] ? (
                <Link href={`/children/${classId}/${encodeURIComponent(kids[0].roll)}`} className="flex min-h-[var(--tap)] items-center text-[var(--link)] underline">
                  A child
                </Link>
              ) : null}
              <Rail edges={[{ screen: "record", label: "Record a note", icon: "note" }, { screen: "assessments", label: "Assessments", icon: "assessment" }]} />
            </div>
          </aside>
        }
      >
        <ClassCountsLine counts={counts} reportsHref={`/children/reports?class=${encodeURIComponent(p.section)}`} />
        <div className="mb-3">
          <ViewToggle current="picture" views={views} />
        </div>
        {p.skills.length === 0 ? (
          <>
            <EmptyState>Not seen yet. No child has been seen on a skill, so there is nothing more to show.</EmptyState>
            <PictureGrid blocks={[{ look: "unseen", words: "Not seen yet", squares }]} grouped={false} label="Class" />
          </>
        ) : (
          <>
            {p.rebuilt ? <p className="b-caption mb-2">Rebuilt {p.rebuilt.slice(0, 16).replace("T", " ")}, from confirmed notes</p> : null}
            <FilterBar
              action={`/children/${classId}`}
              keep={{}}
              filters={[
                { name: "skill", label: "Skill", value: skill?.code, all: "", required: true, options: skills.map((s) => [s.code, `${s.name} · ${s.seen} seen`] as const) },
                { name: "domain", label: "Domain", value: domain, all: "All", options: domains.map((d) => [d, d] as const) },
                { name: "group", label: "Group by", value: sp.group, all: "State on this skill", options: [["class", "Class: one grid, in Sr. No. order"]] },
              ]}
            />
            <div className="mb-3">
              <StackBar parts={parts} />
            </div>
            <PictureGrid blocks={blocks} grouped={grouped} label={`${skill?.name ?? "Skill"}`} />
            <h2 className="mt-4 mb-2 text-[18px]">Secure over six fortnights</h2>
            <Spark values={[]} label="Secure children" empty="No fortnights recorded yet" />
            <h2 className="mt-4 mb-2 text-[18px]">Clusters</h2>
            <Clusters clusters={clusters} kids={kidChosen} />
          </>
        )}
      </Screen>
    </PeekProvider>
  );
}

