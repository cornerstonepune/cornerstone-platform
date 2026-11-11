import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { objectiveOf, type ObjectiveActivity } from "@/lib/teaching";

// One learning objective (UI-3c): the skills it builds, each with the skills a person confirmed come before it, and the activities
// that build toward it. The system reads a child's state on the skills; it never scores the objective itself, so no number,
// percentage or state is drawn for the objective (tests/u73-teaching-pages.spec.ts, a scan of the page's own words).
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function ObjectiveScreen({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireStaff();
  await openTo(me);
  const o = await objectiveOf(me, decodeURIComponent((await params).code));
  if (!o) notFound();
  const skillHref = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const activityHref = (code: string) => screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}`;
  const edges: Edge[] = [
    ...o.skills.map((s): Edge => ({ screen: "skill", params: { code: s.code }, label: s.name, icon: "skill" })),
    ...o.activities.map((a): Edge => ({ screen: "activity", params: { code: a.code }, label: a.name, icon: "activity" })),
  ];
  const cards = o.skills.map((s) => ({
    kind: "skill" as const,
    title: s.name,
    line: s.after.length ? `Comes after: ${s.after.join(", ")}` : "No confirmed skill comes before it.",
    href: skillHref(s.code),
    link: "Open the skill",
  }));
  const groups = Array.from({ length: Math.ceil(cards.length / 3) }, (_, i) => cards.slice(i * 3, i * 3 + 3));
  return (
    <Screen
      stage={`Learning objective · ${o.band} · ${o.subject}`}
      title={o.title}
      purpose="An objective names the skills it builds. The system reads a child's state on those skills; it never scores the objective itself."
      action={<span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{o.code}</span>}
      next={{ href: "/today", label: "Today" }}
      rail={<Rail edges={edges} />}
    >
      <div className="grid gap-[var(--space-3)]">
        <h2 className="text-[length:var(--text-title-small)]">Skills it builds</h2>
        {groups.length ? groups.map((g, i) => <Cards key={i} cards={g} />) : <EmptyState>No skill linked to this objective yet. The curriculum team links skills; nothing is guessed here.</EmptyState>}
        <h2 className="text-[length:var(--text-title-small)]">Activities that build toward it</h2>
        <DataTable<ObjectiveActivity>
          label="Activities that build toward this objective"
          rowKey={(a) => a.code}
          rows={o.activities}
          more={{ page: 1, href: () => "#" }}
          columns={[
            { key: "name", label: "Activity", value: (a) => a.name, cell: (a) => <a href={activityHref(a.code)} data-activity-row>{a.name}</a> },
            { key: "strand", label: "Subject", value: (a) => a.strand },
            { key: "band", label: "Band", value: (a) => a.band },
            { key: "last", label: "Last taught", value: (a) => (a.last ? day(a.last) : "Not taught yet") },
          ]}
        />
      </div>
    </Screen>
  );
}
