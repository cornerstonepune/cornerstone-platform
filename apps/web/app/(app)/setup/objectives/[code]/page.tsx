import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { DetailPanel } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { MachineIf, originFilter } from "@/components/origin";
import { Screen } from "@/components/app-frame";
import { objectiveOpened } from "@/components/curriculum-panel";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { ORIGIN_WORDS, passes, pickOrigin } from "@/lib/origin";
import { objectiveOf, type ObjectiveActivity } from "@/lib/teaching";

// One learning objective (page charter Part C and A2): Curriculum's objective panel opened full page. Skills · Activities: the skills it
// builds, each with the skills a person confirmed come before it, and the activities that build toward it, each link with where it came
// from (sheet, machine or person, CP-48; the machine's with its one symbol), narrowed by the origin filter. The system reads a child's state
// on the skills; it never scores the objective itself, so no number, percentage or state is drawn for the objective
// (tests/u73-teaching-pages.spec.ts, a scan of the page's own words).
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function ObjectiveScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ origin?: string; tab?: string }> }) {
  const me = await requireStaff();
  await openTo(me);
  const o = await objectiveOf(me, decodeURIComponent((await params).code));
  if (!o) notFound();
  const q = await searchParams;
  const origin = pickOrigin(q.origin);
  const skillHref = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const activityHref = (code: string) => screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}`;
  const cards = o.skills
    .filter((s) => passes(origin, s.origin))
    .map((s) => ({
      kind: "skill" as const,
      title: s.name,
      line: `${s.after.length ? `Comes after: ${s.after.join(", ")}` : "No confirmed skill comes before it."}${s.origin ? ` · linked from the ${ORIGIN_WORDS[s.origin].toLowerCase()}` : ""}`,
      href: skillHref(s.code),
      link: "Open the skill",
    }));
  const groups = Array.from({ length: Math.ceil(cards.length / 3) }, (_, i) => cards.slice(i * 3, i * 3 + 3));
  const here = `/setup/objectives/${encodeURIComponent(o.code)}`;
  const skills = groups.length ? (
    <div className="grid gap-[var(--space-3)]">{groups.map((g, i) => <Cards key={i} cards={g} />)}</div>
  ) : (
    <EmptyState>{origin ? "No skill of that origin." : "No skill linked to this objective yet. The curriculum team links skills; nothing is guessed here."}</EmptyState>
  );
  const activities = (
    <DataTable<ObjectiveActivity>
      label="Activities that build toward this objective"
      rowKey={(a) => a.code}
      rows={o.activities.filter((a) => passes(origin, a.origin))}
      more={{ page: 1, href: () => "#" }}
      columns={[
        { key: "name", label: "Activity", value: (a) => a.name, cell: (a) => <span className="flex items-center gap-2"><a href={activityHref(a.code)} data-activity-row>{a.name}</a><MachineIf origin={a.origin} /></span> },
        { key: "strand", label: "Subject", value: (a) => a.strand },
        { key: "origin", label: "Linked from", value: (a) => (a.origin ? ORIGIN_WORDS[a.origin] : "") },
        { key: "last", label: "Last taught", value: (a) => (a.last ? day(a.last) : "Not taught yet") },
      ]}
    />
  );
  return (
    <Screen
      stage={`Learning objective · ${o.band} · ${o.subject}`}
      title={o.title}
      purpose="An objective names the skills it builds. The system reads a child's state on those skills; it never scores the objective itself."
      action={<FilterBar action={here} keep={{ tab: q.tab }} filters={[originFilter(origin)]} />}
      next={{ href: `/setup/curriculum?${new URLSearchParams({ open: `objective:${o.code}` })}`, label: "Curriculum" }}
    >
      <DetailPanel inline summary={{ title: "", stats: [] }} open={objectiveOpened(o, { key: `objective:${o.code}`, tab: q.tab, origin, activityHref, skills, activities })} />
    </Screen>
  );
}
