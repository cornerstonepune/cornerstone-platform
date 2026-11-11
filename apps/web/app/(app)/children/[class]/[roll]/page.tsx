import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { ChildGraph, type GraphSkill } from "@/components/child-graph";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { NotYours } from "@/components/not-yours";
import { StatusChip } from "@/components/status-chip";
import { Timeline } from "@/components/timeline";
import { Trend } from "@/components/trend";
import { Answers } from "@/components/children/answers";
import { SwitchedOff } from "@/components/children/switched-off";
import { requireStaff } from "@/lib/auth";
import { screensOn } from "@/lib/children-reads";
import { screenHref } from "@/lib/built";
import { childOf, historyOf } from "@/lib/children-peek";
import { sittingsOf, skillsOfChild, type ChildSkill } from "@/lib/children-picture";
import { initialsOf } from "@/lib/children-view";
import { childEvidence, misconceptionNames } from "@/lib/queries";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";

const PAGE = 10;
const DOMAIN_SLOTS = ["numeracy", "language", "arts"] as const;

// One child's page (UI-3b): where the child is on each skill. The graph and the table hold the same skills with the same words;
// on a phone the graph is not drawn and the table is the list. The address is by class and Sr. No.; a name is never in it.
export default async function TheChild({ params, searchParams }: { params: Promise<{ class: string; roll: string }>; searchParams: Promise<{ skill?: string; before?: string; answers?: string }> }) {
  const me = await requireStaff();
  if (!(await screensOn())) return <SwitchedOff title="Where this child is" stage="Children" />;
  const { class: classId, roll } = await params;
  const sp = await searchParams;
  const child = await childOf({ ...me, email: me.email }, classId, roll);
  if (!child) return <NotYours what="This child's class" />;
  const name = [child.first_name, child.last_name].filter(Boolean).join(" ");
  const skills = await skillsOfChild(child.id);
  const skill = skills.find((s) => s.code === sp.skill) ?? skills[0];
  const sittings = skill ? await sittingsOf(child.id, skill.code) : [];
  const [evidence, mistakes] = await Promise.all([childEvidence(child.id), misconceptionNames(child.id)]);
  const answersPage = Math.max(1, Number.parseInt(sp.answers ?? "1", 10) || 1);
  const newest = await historyOf(child.id, PAGE + 1, sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null);
  const entries = newest.slice(0, PAGE);
  const older = newest.length > PAGE ? entries[entries.length - 1]?.at : undefined;
  const href = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const domains = [...new Set(skills.map((s) => s.domain))].sort();
  const slot = (d: string) => DOMAIN_SLOTS[Math.max(0, domains.indexOf(d)) % DOMAIN_SLOTS.length];
  const graph: GraphSkill[] = skills.map((s) => ({ name: s.name, state: s.look, seen: s.seen, domain: slot(s.domain), href: href(s.code) }));
  const by = { secure: 0, practising: 0, emerging: 0 };
  for (const s of skills) by[s.look]++;
  const label = `${skills.length} ${skills.length === 1 ? "skill" : "skills"} seen: ${by.secure} secure, ${by.practising} practising, ${by.emerging} emerging`;
  const note = screenHref("record") ?? "/voice";
  return (
    <Screen
      stage={`${child.section} · Sr. No. ${child.roll_no} · ${name}`}
      title="Where this child is"
      purpose="Each skill this child was seen on, coloured by how secure it is and sized by how often. Every mark opens the note or paper behind it."
      action={<Link href={note} className="btn secondary">Add a note about this child</Link>}
      next={{ href: `/children/${classId}`, label: "The class" }}
      rail={
        <aside aria-label="Rail" data-rail className="grid content-start gap-[var(--space-3)]">
          <nav aria-label="Back to the class" className="rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
            <Link href={`/children/${classId}`} className="flex min-h-[var(--tap)] items-center text-[var(--link)] underline">Back to the class</Link>
          </nav>
          <Rail edges={[{ screen: "reports", label: "Reports", icon: "parent" }]} />
        </aside>
      }
    >
      {skills.length === 0 ? (
        <>
          <EmptyState>Not seen yet on any skill. The graph is the child alone.</EmptyState>
          <ChildGraph initials={initialsOf(name)} skills={[]} empty="not seen yet" label="0 skills seen" />
        </>
      ) : (
        <>
          <ChildGraph initials={initialsOf(name)} skills={graph} label={label} table={false} />
          <h2 className="mt-4 mb-2 text-[18px]">Skills, in domain order</h2>
          <p className="mb-2 text-[13px]">
            <Link href={`/children/${classId}?view=matrix`} data-all-skills>Against every skill →</Link>
          </p>
          <DataTable<ChildSkill> label="Where this child is on each skill" columns={columns(href)} rows={skills} rowKey={(s) => s.code} more={{ page: 1, href: () => "" }} limit={skills.length} />
          <h2 className="mt-4 mb-2 text-[18px]">Level by sitting</h2>
          <FilterBar action={`/children/${classId}/${encodeURIComponent(roll)}`} filters={[{ name: "skill", label: "Skill", value: skill?.code, all: "", required: true, options: skills.map((s) => [s.code, s.name] as const) }]} />
          <Trend sittings={sittings} empty="No sitting with a level named yet" />
        </>
      )}
      <h2 className="mt-4 mb-2 text-[18px]">What was seen</h2>
      {entries.length === 0 ? <EmptyState>Nothing seen yet for this child.</EmptyState> : <Timeline entries={[...entries].reverse().map((e) => ({ kind: e.kind, title: e.title, line: e.line, when: e.when, more: e.more }))} />}
      {older ? (
        <p className="mt-2">
          <Link data-more href={`/children/${classId}/${encodeURIComponent(roll)}?${new URLSearchParams({ ...(skill ? { skill: skill.code } : {}), before: older })}`}>Older entries</Link>
        </p>
      ) : null}
      <h2 className="mt-4 mb-2 text-[18px]">Answers</h2>
      <Answers
        rows={evidence}
        names={mistakes}
        skills={Object.fromEntries(skills.map((s) => [s.code, s.name]))}
        page={answersPage}
        href={(p) => `/children/${classId}/${encodeURIComponent(roll)}?${new URLSearchParams({ ...(skill ? { skill: skill.code } : {}), ...(sp.before ? { before: sp.before } : {}), answers: String(p) })}`}
      />
    </Screen>
  );
}

function columns(href: (code: string) => string): Column<ChildSkill>[] {
  return [
    { key: "skill", label: "Skill", keep: true, value: (s) => s.name, cell: (s) => <Link href={href(s.code)} data-skill-row className="inline-flex min-h-[var(--tap)] items-center">{s.name}</Link> },
    { key: "state", label: "State", keep: true, status: true, value: (s) => s.words, cell: (s) => <StatusChip state={s.look} round /> },
    { key: "days", label: "Times seen", keep: true, num: true, value: (s) => s.seen },
    { key: "seen", label: "Last seen", keep: true, value: (s) => (s.lastSeen ? dateWords(s.lastSeen) : "not yet") },
    { key: "next", label: "Ready next", keep: true, value: (s) => s.readyNext.join(", ") || "nothing confirmed yet" },
  ];
}
