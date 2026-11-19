import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Approve } from "@/components/activity/status-bar";
import { Crumbs } from "@/components/crumbs";
import { Screen } from "@/components/app-frame";
import { ObjectiveEdit } from "@/components/curriculum/objective-edit";
import { MachineMark } from "@/components/origin";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { screenHref } from "@/lib/built";
import { curriculumTree } from "@/lib/curriculum-cache";
import { gateFor } from "@/lib/curriculum-screens";
import { placeOf } from "@/lib/detail-trail";
import { subjectList } from "@/lib/curriculum-tree";
import { openTo } from "@/lib/educator/data";
import { objectiveOf } from "@/lib/teaching";
import { chainOf } from "@/lib/objective-chain";
import { ObjectiveChain } from "./chain";

// One learning objective (Nimish, 19 Nov 2026; CP-64 before it): the path, the title, grade and subject, a slim bar (Approve and Edit for a
// reviewer), and two lists side by side: the skills it builds and the activities that build toward it, each row a link; where it sits is
// folded. The system reads a child's state on the skills; it never scores the objective itself, so no number, percentage or state is drawn
// for the objective (tests/u73-teaching-pages.spec.ts, a scan of the page's own words).
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const SHOWN = 5;

export default async function ObjectiveScreen({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ edit?: string; all?: string }> }) {
  const me = await requireStaff();
  await openTo(me);
  const o = await objectiveOf(me, decodeURIComponent((await params).code));
  if (!o) notFound();
  const q = await searchParams;
  const [chain, place, gate] = await Promise.all([chainOf(o.code), placeOf(o), gateFor(me.email)]);
  const reviews = gate?.reviews ?? false;
  const skillHref = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const activityHref = (code: string) => `${screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}`}?from=${encodeURIComponent(o.code)}`;
  const here = `/setup/objectives/${encodeURIComponent(o.code)}`;
  const waiting = o.origin === "machine" || o.skills.some((s) => s.origin === "machine") || o.activities.some((a) => a.origin === "machine");
  const editing = reviews && q.edit === "1";
  const edit = editing ? <ObjectiveEdit lo={o} subjects={await subjectList()} grades={(await curriculumTree()).map((g) => ({ code: g.code, name: g.name }))} back={`${here}?edit=1`} /> : null;
  const all = q.all === "1";
  const skills = all ? o.skills : o.skills.slice(0, SHOWN);
  const acts = all ? o.activities : o.activities.slice(0, SHOWN);
  const more = o.skills.length > SHOWN || o.activities.length > SHOWN;
  const chip = (t: string) => <span className="b-nchipc" data-chip>{t}</span>;
  return (
    <Screen
      stage="Learning objective"
      stageChip={<span className="inline-flex flex-wrap items-center gap-[var(--space-1)]">{o.grades.map((g, i) => <span key={g}>{chip(i === 0 ? place.grade : g)}</span>)}{place.subject ? chip(place.subject) : null}</span>}
      trail={<Crumbs parts={place.crumbs} here={o.title} />}
      title={o.title}
      purpose="The skills it builds and the activities that build toward it."
      action={
        <div className="flex flex-wrap items-center gap-[var(--space-2)]" data-status-bar>
          {waiting ? (
            <p className="flex items-center gap-[var(--space-1)]" data-machine-line>
              <MachineMark />
              <span>Drafted by the machine</span>
            </p>
          ) : null}
          {reviews && waiting ? <Approve kind="objective" code={o.code} name={o.title} back={here} words="Approve" /> : null}
          {reviews && !editing ? <Link href={`${here}?edit=1`} className="btn secondary" scroll={false} data-edit="objective">Edit</Link> : null}
        </div>
      }
      next={{ href: place.crumbs[place.crumbs.length - 1]?.href ?? "/setup/curriculum", label: "Back to the unit" }}
    >
      {edit ? (
        <section className="card grid gap-[var(--space-2)]" data-card aria-label="Edit the objective">
          {edit}
          <Link href={here} className="btn secondary w-fit" scroll={false}>Done</Link>
        </section>
      ) : null}
      <div className="grid items-start gap-[var(--space-3)] md:grid-cols-2" data-objective-lists>
        <section className="card grid content-start gap-[var(--space-1)]" data-card aria-labelledby="h-skills">
          <h2 id="h-skills" className="min-h-[var(--tap)] text-[length:var(--text-body)] font-semibold">Skills it builds</h2>
          {skills.length ? (
            <ul className="grid gap-[var(--space-1)]">
              {skills.map((s) => (
                <li key={s.code} data-skill-link className="grid min-h-[var(--tap)] content-center">
                  <span className="flex items-center gap-[var(--space-1)]">
                    <Link href={skillHref(s.code)} className="[overflow-wrap:anywhere]">{s.name}</Link>
                    {s.origin === "machine" ? <MachineMark /> : null}
                  </span>
                  {s.after.length ? <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">Comes after: {s.after.join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--ink-muted)]">No skill linked yet.</p>
          )}
        </section>
        <section className="card grid content-start gap-[var(--space-1)]" data-card aria-labelledby="h-acts">
          <h2 id="h-acts" className="min-h-[var(--tap)] text-[length:var(--text-body)] font-semibold">Activities that build toward it</h2>
          {acts.length ? (
            <ul className="grid gap-[var(--space-1)]">
              {acts.map((a) => (
                <li key={a.code} data-activity-item className="grid min-h-[var(--tap)] content-center">
                  <span className="flex flex-wrap items-center gap-x-[var(--space-2)]">
                    <Link href={activityHref(a.code)} data-activity-link data-activity-row className="[overflow-wrap:anywhere]">{a.name}</Link>
                    {a.origin === "machine" ? <StatusChip state="toApprove" compact /> : null}
                  </span>
                  <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{a.last ? `Last taught ${day(a.last)}` : "Not taught yet"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--ink-muted)]">No activity linked yet.</p>
          )}
        </section>
      </div>
      {more && !all ? <Link href={`${here}?all=1`} className="btn secondary w-fit" scroll={false}>Show all</Link> : null}
      {chain ? (
        <section className="card" data-card>
          <details>
            <summary className="flex min-h-[var(--tap)] cursor-pointer items-center font-semibold">Where it sits</summary>
            <div className="mt-[var(--space-2)]">
              <ObjectiveChain c={chain} />
            </div>
          </details>
        </section>
      ) : null}
    </Screen>
  );
}
