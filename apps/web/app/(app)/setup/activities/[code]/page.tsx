import { notFound } from "next/navigation";
import { ActivitySections } from "@/components/activity-page";
import { FilterBar } from "@/components/filter-bar";
import { originFilter } from "@/components/origin";
import { Screen } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { gateFor } from "@/lib/curriculum-screens";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { pickOrigin } from "@/lib/origin";
import { activityFacts, activityPage } from "@/lib/teaching";
import { ApproveForm } from "../../curriculum/approve";

// One activity on one screen (CP-53, Nimish 14 Nov 2026; before it Curriculum's panel opened full page in four tabs): what the child
// learns, how to mark, the steps and how to think about them, the materials, where it sits and how it was taught, each block the site's
// own card (components/activity-page.tsx). Every part is edited in place by the curriculum's reviewers, the school's words included;
// whatever the machine made or linked carries its one symbol until a person approves it, and "Approve all of this activity" is the page's
// main action while anything waits. An educator who does not review sees the same page, read only. An old `?tab=` address still opens it.
export default async function ActivityScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ back?: string; origin?: string; tab?: string }> }) {
  const me = await requireStaff();
  const code = decodeURIComponent((await params).code);
  const q = await searchParams;
  // the materials list or the timetable opens the activity with its own address as `back`: the next step returns to it
  const back = q.back;
  await openTo(me);
  const page = await activityPage(code);
  if (!page) notFound();
  const [facts, gate] = await Promise.all([activityFacts(me, page.code), gateFor(me.email)]);
  const origin = pickOrigin(q.origin);
  const here = `/setup/activities/${encodeURIComponent(page.code)}`;
  const self = new URLSearchParams(Object.entries({ back, origin }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
  const reviews = gate?.reviews ?? false;
  const waits = page.parts.some((p) => p.source === "drafted") || [...facts.objectives, ...facts.skills].some((l) => l.origin === "machine" || l.own === "machine");
  const objective = page.parts.find((p) => p.part === "objective");
  return (
    <Screen
      stage={`Activity ${page.code} · ${page.section}`}
      title={page.name}
      purpose={(objective?.text || "What this activity is for is not written yet.").slice(0, 140)}
      action={
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          {reviews && waits ? <ApproveForm kind="activity" code={page.code} name={page.name} words="Approve all of this activity" back={self.size ? `${here}?${self}` : here} /> : null}
          <FilterBar action={here} keep={{ back }} filters={[originFilter(origin)]} />
        </div>
      }
      next={back?.startsWith("/timetable?") ? { href: back, label: "Back to the day" } : { href: `/setup/curriculum?${new URLSearchParams({ open: `activity:${page.code}` })}`, label: "Curriculum" }}
    >
      <ActivitySections
        page={page}
        facts={facts}
        edits={reviews}
        origin={origin}
        back={self.size ? `${here}?${self}` : here}
        objectiveHref={(c) => screenHref("objective", { code: c }) ?? `/setup/objectives/${encodeURIComponent(c)}`}
      />
    </Screen>
  );
}
