import { notFound } from "next/navigation";
import Link from "@/components/link";
import { ActivitySections } from "@/components/activity-page";
import { StatusBar } from "@/components/activity/status-bar";
import { Crumbs } from "@/components/crumbs";
import { Screen } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { gateFor } from "@/lib/curriculum-screens";
import { openTo } from "@/lib/educator/data";
import { screenHref } from "@/lib/built";
import { activityEdit } from "@/lib/activity-edit";
import { nextToApprove, placeOf, type Crumb } from "@/lib/detail-trail";
import { activityFacts, activityPage, objectiveOf } from "@/lib/teaching";

// One activity on one page (Nimish, 19 Nov 2026; CP-53 before it): the full path, the title, one line of what it is for, grade and subject, and a
// slim bar that says what the machine drafted with Approve and Approve & next; then the sections (components/activity-page.tsx), each reading
// clean with its own Edit. An educator who does not review sees the same page read only. `?edit=<section>` opens one section's form;
// `?from=<objective>` is the objective the path runs through when the activity belongs to several. An old `?tab=` address still opens it.
type Q = { back?: string; from?: string; edit?: string; find?: string; kind?: string; open?: string; said?: string; tab?: string };

export default async function ActivityScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const code = decodeURIComponent((await params).code);
  const q = await searchParams;
  await openTo(me);
  const page = await activityPage(code);
  if (!page) notFound();
  const [facts, gate] = await Promise.all([activityFacts(me, page.code), gateFor(me.email)]);
  const here = `/setup/activities/${encodeURIComponent(page.code)}`;
  const base = { back: q.back, from: q.from };
  const at = (more: Record<string, string | undefined> = {}) => {
    const s = new URLSearchParams(Object.entries({ ...base, ...more }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${here}?${s}` : here;
  };
  const reviews = gate?.reviews ?? false;
  const edit = await activityEdit(me, page.code, { objectives: facts.objectives.map((o) => o.code), skills: facts.skills.map((s) => s.code) });
  const objectiveHref = (c: string) => screenHref("objective", { code: c }) ?? `/setup/objectives/${encodeURIComponent(c)}`;
  const skillHref = (c: string) => screenHref("skill", { code: c }) ?? `/setup/skills/${encodeURIComponent(c)}`;
  // the path runs through one objective: the one named, else the first this activity builds toward
  const via = facts.objectives.find((o) => o.code === q.from) ?? facts.objectives[0];
  const lo = via ? await objectiveOf(me, via.code) : null;
  const place = lo ? await placeOf(lo) : null;
  const trail: Crumb[] = lo && place ? [...place.crumbs, { label: lo.title, href: objectiveHref(lo.code) }] : [{ label: "Curriculum", href: "/setup/curriculum" }];
  const sibs = lo?.activities ?? [];
  const at_ = sibs.findIndex((a) => a.code === page.code);
  const to = (i: number) => (sibs[i] ? `${here.replace(encodeURIComponent(page.code), encodeURIComponent(sibs[i].code))}?from=${encodeURIComponent(lo!.code)}` : null);
  const [prev, next] = [at_ > 0 ? to(at_ - 1) : null, at_ >= 0 && at_ < sibs.length - 1 ? to(at_ + 1) : null];
  const waitsParts = page.parts.filter((p) => p.source === "drafted").length;
  const waitsLinks = [...facts.objectives, ...facts.skills].filter((l) => l.origin === "machine" || l.own === "machine").length;
  const waiting = waitsParts + waitsLinks > 0;
  const gradeCode = edit.grades[0]?.code;
  const after = waiting && reviews && gradeCode ? await nextToApprove(page.code, gradeCode) : null;
  const nextHref = after ? `/setup/activities/${encodeURIComponent(after.code)}` : "";
  const purpose = (page.parts.find((p) => p.part === "objective")?.text || "What this activity is for is not written yet.").split(/(?<=[.!?])\s/)[0].slice(0, 140);
  const chip = (t: string) => <span className="b-nchipc" data-chip>{t}</span>;
  return (
    <Screen
      stage="Activity"
      stageChip={<span className="inline-flex flex-wrap items-center gap-[var(--space-1)]">{edit.grades.map((g) => <span key={g.code}>{chip(g.name)}</span>)}{page.section ? chip(page.section) : null}</span>}
      trail={<Crumbs parts={trail} here={page.name} />}
      title={page.name}
      purpose={purpose}
      action={waiting ? <StatusBar code={page.code} name={page.name} parts={waitsParts} links={waitsLinks} reviews={reviews} here={at()} next={after ? { ...after, href: nextHref } : null} /> : undefined}
      next={q.back?.startsWith("/timetable?") ? { href: q.back, label: "Back to the day" } : lo ? { href: objectiveHref(lo.code), label: "Back to the objective" } : { href: "/setup/curriculum", label: "Curriculum" }}
    >
      {sibs.length > 1 && at_ >= 0 ? (
        <nav aria-label="Activities of this objective" className="flex flex-wrap items-center gap-[var(--space-2)]" data-siblings>
          {prev ? <Link href={prev} className="btn secondary">‹ Previous</Link> : null}
          <span className="text-[var(--ink-muted)]">Activity {at_ + 1} of {sibs.length} for this objective</span>
          {next ? <Link href={next} className="btn secondary">Next ›</Link> : null}
        </nav>
      ) : null}
      <ActivitySections
        page={page}
        facts={facts}
        edits={reviews}
        edit={reviews ? edit : undefined}
        grades={edit.grades.map((g) => g.name)}
        said={q.said?.slice(0, 200)}
        at={at}
        editing={q.edit}
        find={q.find}
        kind={q.kind}
        details={q.open === "details"}
        objectiveHref={(c) => `${objectiveHref(c)}`}
        skillHref={skillHref}
      />
    </Screen>
  );
}
