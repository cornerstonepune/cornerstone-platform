import { notFound } from "next/navigation";
import { DetailPanel } from "@/components/detail-panel";
import { FilterBar } from "@/components/filter-bar";
import { originFilter } from "@/components/origin";
import { Screen } from "@/components/app-frame";
import { activityOpened } from "@/components/curriculum-panel";
import { requireStaff } from "@/lib/auth";
import { gateFor } from "@/lib/curriculum-screens";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { pickOrigin } from "@/lib/origin";
import { activityFacts, activityPage } from "@/lib/teaching";

// One activity (page charter Part C and A2): Curriculum's activity panel opened full page, at its own address, so it can be linked. The same
// tabs, Parts · Objectives · Skills · Taught: every part in the school's words with where it came from (sheet, machine or person, CP-48; the
// machine's with its one symbol), the objectives it builds toward and the skills it carries with where each link came from, and how the
// classes sat on it. A part the machine made is edited in place by whoever the curriculum's gate lets in: nothing waits for a person. A part
// with no words is shown empty and marked, never filled in. It is the coordinator's page under School; a lesson's own page carries the
// activity for the educator (B4).
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
  const self = (extra: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ back, origin, ...extra }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${here}?${s}` : here;
  };
  const objective = page.parts.find((p) => p.part === "objective");
  return (
    <Screen
      stage={`Activity ${page.code} · ${page.section}`}
      title={page.name}
      purpose={(objective?.text || "What this activity is for is not written yet.").slice(0, 140)}
      action={<FilterBar action={here} keep={{ back, tab: q.tab }} filters={[originFilter(origin)]} />}
      next={back?.startsWith("/timetable?") ? { href: back, label: "Back to the day" } : { href: `/setup/curriculum?${new URLSearchParams({ open: `activity:${page.code}` })}`, label: "Curriculum" }}
    >
      <DetailPanel
        inline
        summary={{ title: "", stats: [] }}
        open={activityOpened(page, facts, {
          key: `activity:${page.code}`,
          tab: q.tab,
          origin,
          edits: gate?.reviews ?? false,
          back: self({ tab: q.tab }),
          objectiveHref: (c) => screenHref("objective", { code: c }) ?? `/setup/objectives/${encodeURIComponent(c)}`,
        })}
      />
    </Screen>
  );
}
