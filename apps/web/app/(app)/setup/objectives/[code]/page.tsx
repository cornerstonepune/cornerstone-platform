import { notFound } from "next/navigation";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { EMERGING, PRACTISING, SECURE, STATES, StatusChip } from "@/components/status-chip";
import { RailAside, TeachingRail, type RailLink } from "@/components/teaching/rail";
import { requireStaff } from "@/lib/auth";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { objectiveOf, type ObjectiveActivity, type SeenOnSkill } from "@/lib/teaching";

// One learning objective (UI-3c): the skills it builds, each with a chip saying a person confirmed a skill comes before it, the
// activities that build toward it, and how many children stand where on each skill. The system reads a child's state on the skills; it
// never scores the objective itself, so no number, percentage or state is drawn for the objective (tests/u73-teaching-pages.spec.ts,
// a scan of the page's own words): the counts below belong to the skills. A chip is drawn only for a confirmed link.
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function ObjectiveScreen({ params }: { params: Promise<{ code: string }> }) {
  const me = await requireStaff();
  await openTo(me);
  const o = await objectiveOf(me, decodeURIComponent((await params).code));
  if (!o) notFound();
  const skillHref = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const activityHref = (code: string) => screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}`;
  const links: RailLink[] = [
    ...o.skills.map((s): RailLink => ({ kind: "skill", screen: "skill", href: skillHref(s.code), label: s.name, note: "a skill it builds" })),
    ...o.activities.map((a): RailLink => ({ kind: "activity", screen: "activity", href: activityHref(a.code), label: a.name, note: "builds toward it" })),
  ];
  const cards = o.skills.map((s) => ({
    kind: "skill" as const,
    title: s.name,
    body: s.after.length ? (
      <>
        <span>
          <StatusChip state="done" words="Prerequisite confirmed" />
        </span>
        <span className="b-muted">Comes after: {s.after.join(", ")}</span>
      </>
    ) : undefined,
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
      rail={
        <RailAside>
          <TeachingRail links={links} />
        </RailAside>
      }
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
            { key: "fortnights", label: "Fortnights", value: (a) => (a.fortnights.length ? a.fortnights.join(", ") : null) },
          ]}
        />
        {o.seen.length ? (
          <>
            <h2 className="text-[length:var(--text-title-small)]">Children seen on each skill</h2>
            <DataTable<SeenOnSkill>
              label="Children seen on each skill"
              rowKey={(s) => s.code}
              rows={o.seen}
              more={{ page: 1, href: () => "#" }}
              columns={[
                { key: "skill", label: "Skill", value: (s) => s.name },
                ...([SECURE, PRACTISING, EMERGING] as const).map((k) => ({ key: k, label: cap(STATES[k].words), value: (s: SeenOnSkill) => s[k], num: true })),
                { key: "unseen", label: cap(STATES.notSeenYet.words), value: (s: SeenOnSkill) => s.unseen, num: true },
              ]}
            />
          </>
        ) : null}
      </div>
    </Screen>
  );
}
