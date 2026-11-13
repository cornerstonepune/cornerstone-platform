import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { ClassGrid } from "@/components/class-grid";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { NotYours } from "@/components/not-yours";
import { STATES } from "@/components/status-chip";
import { SwitchedOff } from "@/components/children/switched-off";
import { ClassViews } from "@/components/children/class-views";
import { ClassCountsLine } from "@/components/children/children-table";
import { childOpened } from "@/components/children/child-panel";
import { ViewToggle } from "@/components/kanban-board";
import { requireStaff } from "@/lib/auth";
import { screensOn, childrenTable } from "@/lib/children-reads";
import { pictureOf } from "@/lib/children-picture";
import { byRoll } from "@/lib/children-view";
import { cardsOf, cellOf, tilesOf } from "@/lib/class-picture";
import { childPanelOf } from "@/lib/child-panel";
import { scaleTone } from "@/lib/state-scale";

type Q = { skill?: string; open?: string; tab?: string; view?: string; topic?: string; subject?: string; kp?: string };

// The class picture (page charter B5), a Workspace: choose the skill (or every skill) first; on the left the class as a grid of child cards
// (Sr. No. and first name) coloured by where each child is on it; on the right the child chosen, in tabs Skills · Notes · Papers · Report, or,
// with no child chosen, the four tiles that count the class on the scale. The address carries the skill, the child (`open=child:<Sr. No.>`,
// never a name) and the tab, so a picture can be linked and reloaded. Names are read through pii.read_child for the classes the person sees.
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
  // the skill chosen, or every skill when none is (or the address names one nobody in the class was seen on)
  const skill = p.skills.find((s) => s.code === sp.skill) ?? null;
  const kids = [...p.kids].sort(byRoll);
  const cards = cardsOf(kids, p.cells, skill?.code ?? null);
  const here = (over: { open?: string; tab?: string }) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ skill: skill?.code, ...over })) if (v) u.set(k, v);
    return `/children/${classId}${u.size ? `?${u}` : ""}`;
  };
  const opened = parseOpen(sp.open);
  const chosen = opened?.kind === "child" ? await childPanelOf({ ...me, email: me.email }, classId, opened.id) : null;
  const counts = (await childrenTable({ ...me, email: me.email })).counts[classId] ?? { answers: 0, reports: 0 };
  const shown = skill ? skill.name : "every skill";
  const tiles = tilesOf(cards).map((t) => ({ id: t.state, n: t.n, line: STATES[t.state].words, tone: scaleTone(t.state) }));
  return (
    <Screen
      stage={`${p.section} · ${kids.length} children`}
      title="Class picture"
      purpose="Where every child in the class stands on a skill, or on every skill at once. Choose the skill, then a child."
      action={
        <>
          <FilterBar action={`/children/${classId}`} keep={{ open: sp.open, tab: sp.tab }} filters={[{ name: "skill", label: "Skill", value: skill?.code, all: "All skills", starting: true, options: p.skills.map((s) => [s.code, `${s.name} · ${s.seen} seen`] as const) }]} />
          <Link href="/children" className="text-[length:var(--text-label)]">Show as a table</Link>
        </>
      }
      panel={
        <DetailPanel
          open={chosen ? childOpened(chosen, { tab: sp.tab, closeHref: here({}), full: `/children/${classId}/${encodeURIComponent(chosen.roll)}`, note: "/today" }) : null}
          summary={{ title: `The class on ${shown}`, stats: tiles }}
        />
      }
    >
      <ClassCountsLine counts={counts} reportsHref={`/children/reports?class=${encodeURIComponent(p.section)}`} />
      <div className="mb-3">
        <ViewToggle current="picture" views={views} />
      </div>
      {p.skills.length === 0 ? <EmptyState>Not seen yet. No child has been seen on a skill, so every card is grey.</EmptyState> : null}
      {p.rebuilt ? <p className="b-caption mb-2">Rebuilt {p.rebuilt.slice(0, 16).replace("T", " ")}, from confirmed notes</p> : null}
      <h2 className="mb-2 text-[16px]">The class on {shown}</h2>
      <ClassGrid label={`${p.section} on ${shown}, by Sr. No.`} cells={cards.map((c) => cellOf(c, here({ open: `child:${c.roll}` }), chosen?.roll === c.roll))} />
    </Screen>
  );
}
