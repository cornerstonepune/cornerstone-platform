import { Suspense } from "react";
import Link from "@/components/link";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { StatTiles } from "@/components/stat-tile";
import { Screen } from "@/components/app-frame";
import { activityOpened, objectiveOpened } from "@/components/curriculum-panel";
import { ObjectiveEdit } from "@/components/curriculum/objective-edit";
import { curriculumCounts } from "@/lib/curriculum-cache";
import { subjectList } from "@/lib/curriculum-tree";
import { grades as schoolGrades } from "@/lib/queries";
import { gateFor } from "@/lib/curriculum-screens";
import { activityMadeByMachine } from "@/lib/curriculum-rows";
import { deadline } from "@/lib/deadline";
import { pickOrigin } from "@/lib/origin";
import { activityFacts, activityPage, objectiveOf } from "@/lib/teaching";
import type { requireStaff } from "@/lib/auth";
import { ApproveForm } from "./approve";
import { Tree } from "./tree";

type Q = Record<string, string | undefined>;
const HERE = "/setup/curriculum";

// Curriculum's own view, the tree (CP-72, issue #842): the one view a click lands on most, so it reads only what it shows. The tree comes
// from what the server keeps (one read per grade); the panel reads only the one objective or activity chosen; the figures on the summary
// band are kept too and are left out, quietly, when they are slow. The appendix and To review (page.tsx) read their own, when opened.
export async function Flow({ me, q }: { me: Awaited<ReturnType<typeof requireStaff>>; q: Q }) {
  const origin = pickOrigin(q.origin);
  const opened = parseOpen(q.open);
  // the tree needs nobody's grant; an item's panel does, so only a click that opens one asks
  const gate = opened ? await gateFor(me.email) : null;
  const reviews = gate?.reviews ?? false;
  const keep = { objective: q.objective, grade: q.grade, subject: q.subject, unit: q.unit };
  // an address of this view: the path through the tree, and the item open
  const at = (over: { open?: string; tab?: string } = {}) => {
    const v = { open: q.open, tab: q.tab, ...over };
    const s = new URLSearchParams(Object.entries({ ...keep, open: v.open, tab: v.tab }).flatMap(([k, x]) => (x ? [[k, x]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const shut = at({ open: "", tab: "" });
  const viewAt = (v: "appendix" | "review") => `${HERE}?view=${v}`;

  // the item on the right: an activity or an objective, both behind the curriculum's gate
  let panel: Opened | null = null;
  if (opened && gate && opened.kind === "activity") {
    const a = await activityPage(opened.id);
    if (a) {
      panel = activityOpened(a, await activityFacts(me, a.code), { key: q.open!, closeHref: shut, full: `/setup/activities/${encodeURIComponent(a.code)}`, tab: q.tab, origin, edits: reviews, back: at({}), objectiveHref: (c) => at({ open: `objective:${c}`, tab: "" }) });
      // CP-51: what the machine made waits for a reviewer's Approve (the panel's machine mark is that test)
      if (reviews && (panel.mark || (await activityMadeByMachine(a.code)))) panel = { ...panel, actions: <ApproveForm kind="activity" code={a.code} name={a.name} back={at({})} /> };
    }
  } else if (opened && gate && opened.kind === "objective") {
    const lo = await objectiveOf(me, opened.id);
    if (lo) {
      panel = objectiveOpened(lo, { key: q.open!, closeHref: shut, full: `/setup/objectives/${encodeURIComponent(lo.code)}`, tab: q.tab, origin, activityHref: (c) => at({ open: `activity:${c}`, tab: "" }), edit: reviews ? <ObjectiveEdit lo={lo} subjects={await subjectList()} grades={(await schoolGrades()).list} back={at({ tab: "edit" })} /> : undefined });
      if (panel.mark && reviews) panel = { ...panel, actions: <ApproveForm kind="objective" code={lo.code} name={lo.title} back={at({})} /> };
    }
  }

  const figures = <Suspense fallback={null}><Figures email={me.email} /></Suspense>;

  return (
    <Screen
      stage=""
      title="Curriculum"
      purpose="Grade, subject, unit, objective."
      details={{ href: "/setup/curriculum/skills", label: "Every skill, with its levels and where it is taught" }}
      panel={<DetailPanel open={panel} summary={{ title: "The curriculum", stats: [], after: figures }} />}
    >
      <nav aria-label="Curriculum views" data-quiet-links className="b-label mb-[var(--space-3)] flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-1)]">
        <Link href={viewAt("appendix")} data-view-link="appendix" className="b-muted underline underline-offset-4">
          Appendix
        </Link>
        <Link href={viewAt("review")} data-view-link="review" className="b-muted underline underline-offset-4">
          To review
        </Link>
      </nav>
      {/* the page's counts stay in view while an objective is open (the panel's summary band shows them only when nothing is) */}
      {panel ? <div className="mb-[var(--space-3)]">{figures}</div> : null}
      <Tree path={{ grade: q.grade, subject: q.subject, unit: q.unit, open: q.open }} />
    </Screen>
  );
}

/** The three counts on the summary band, for a person with the curriculum's grant: from what the server keeps; slow or refused, none. */
async function figuresFor(email: string) {
  try {
    if (!(await gateFor(email))) return null;
    return await deadline(curriculumCounts(), 1_500);
  } catch {
    return null;
  }
}

/** They stream in after the tree; when they cannot be had they are left out, never the page error. */
async function Figures({ email }: { email: string }) {
  const counts = await figuresFor(email);
  if (!counts) return null;
  return (
    <StatTiles
      label="The curriculum"
      stats={[
        { id: "objectives", n: counts.objectives, line: "objectives" },
        { id: "with-activity", n: counts.withActivity, line: "with an activity" },
        { id: "machine", n: counts.machineToCheck, line: "made by the machine, to check" },
      ]}
    />
  );
}
