import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DetailPanel } from "@/components/detail-panel";
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
import { Papers, childOpened } from "@/components/children/child-panel";
import { requireStaff } from "@/lib/auth";
import { screensOn } from "@/lib/children-reads";
import { screenHref } from "@/lib/built";
import { historyOf, rebuiltAt } from "@/lib/children-peek";
import { childPanelOf } from "@/lib/child-panel";
import { Cards } from "@/components/cards";
import { sittingsOf, type ChildSkill } from "@/lib/children-picture";
import { initialsOf } from "@/lib/children-view";
import { childEvidence, misconceptionNames } from "@/lib/queries";
import { dateWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";

const PAGE = 10;
const DOMAIN_SLOTS = ["numeracy", "language", "arts"] as const;

// One child's page (page charter B5, Part C): the class picture's child panel opened full page, at its own address (by class and Sr. No.;
// a name is never in it), so it can be linked. The tabs are the panel's, Skills · Notes · Papers · Report, each saying more here: the graph
// and the skills table (on a phone the graph is not drawn and the table is the list), every entry seen, the answers behind the papers.
export default async function TheChild({ params, searchParams }: { params: Promise<{ class: string; roll: string }>; searchParams: Promise<{ skill?: string; before?: string; answers?: string; tab?: string }> }) {
  const me = await requireStaff();
  if (!(await screensOn())) return <SwitchedOff title="Where this child is" stage="Children" />;
  const { class: classId, roll } = await params;
  const sp = await searchParams;
  const c = await childPanelOf({ ...me, email: me.email }, classId, roll);
  if (!c) return <NotYours what="This child's class" />;
  const here = (q: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
    return `/children/${classId}/${encodeURIComponent(roll)}${u.size ? `?${u}` : ""}`;
  };
  const skills = c.skills;
  const skill = skills.find((s) => s.code === sp.skill) ?? skills[0];
  const sittings = skill ? await sittingsOf(c.id, skill.code) : [];
  const [evidence, mistakes, rebuilt] = await Promise.all([childEvidence(c.id), misconceptionNames(c.id), rebuiltAt()]);
  const answersPage = Math.max(1, Number.parseInt(sp.answers ?? "1", 10) || 1);
  const newest = await historyOf(c.id, PAGE + 1, sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null);
  const entries = newest.slice(0, PAGE);
  const older = newest.length > PAGE ? entries[entries.length - 1]?.at : undefined;
  const href = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const domains = [...new Set(skills.map((s) => s.domain))].sort();
  const slot = (d: string) => DOMAIN_SLOTS[Math.max(0, domains.indexOf(d)) % DOMAIN_SLOTS.length];
  const graph: GraphSkill[] = skills.map((s) => ({ name: s.name, state: s.look, seen: s.seen, domain: slot(s.domain), href: href(s.code) }));
  const by = { secure: 0, practising: 0, emerging: 0 };
  for (const s of skills) by[s.look]++;
  const label = `${skills.length} ${skills.length === 1 ? "skill" : "skills"} seen: ${by.secure} secure, ${by.practising} practising, ${by.emerging} emerging`;
  const summary = c.summary;
  const lastSeen = [...skills].filter((s) => s.lastSeen).sort((a, b) => b.lastSeen!.localeCompare(a.lastSeen!));
  const cards = [
    {
      kind: "child" as const,
      title: "Counts by state",
      line: `${by.secure} secure · ${by.practising} practising · ${by.emerging} emerging`,
      body: (
        <span className="b-caption">
          {skills.length} {skills.length === 1 ? "skill" : "skills"} seen in all · Sr. No. {c.roll} of {summary.of} in {c.section}
          {summary.since ? `, since ${dateWords(summary.since)}` : ""}
        </span>
      ),
    },
    {
      kind: "child" as const,
      title: "Last seen, by skill",
      body: lastSeen.length === 0 ? <span className="b-muted">Not seen yet</span> : (
        <ul className="grid gap-1 text-[13px]" data-last-seen>
          {lastSeen.map((s) => (
            <li key={s.code}>
              {s.name} <span className="b-muted">· {dateWords(s.lastSeen)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      kind: "note" as const,
      title: "Notes and papers",
      body: (
        <ul className="grid gap-1 text-[13px]" data-notes-papers>
          <li>Notes confirmed · {summary.notes}</li>
          <li>Papers read · {summary.papers}</li>
          <li>Corrections · {summary.corrections}</li>
          <li>Newest entry · {summary.newest ? dateWords(summary.newest) : "none yet"}</li>
        </ul>
      ),
    },
  ];
  const skillsTab = skills.length === 0 ? (
    <>
      <EmptyState>Not seen yet on any skill. The graph is the child alone.</EmptyState>
      <ChildGraph initials={initialsOf(c.name)} skills={[]} empty="not seen yet" label="0 skills seen" />
    </>
  ) : (
    <>
      <ChildGraph initials={initialsOf(c.name)} skills={graph} label={label} table={false} />
      <h3 className="mt-4 mb-2 text-[16px]">Skills, in domain order</h3>
      {rebuilt ? <p className="b-caption mb-2">Rebuilt {rebuilt.replace("T", " ")}, from confirmed notes and papers</p> : null}
      <DataTable<ChildSkill> label="Where this child is on each skill" columns={columns(href)} rows={skills} rowKey={(s) => s.code} more={{ page: 1, href: () => "" }} limit={skills.length} />
      <p className="mt-2 text-[13px]">
        <Link href={`/children/${classId}?view=matrix`} data-all-skills>Against every skill →</Link>
      </p>
      <div className="mt-4">
        <Cards cards={cards} />
      </div>
      <h3 className="mt-4 mb-2 text-[16px]">Skill by skill</h3>
      <DataTable<ChildSkill> label="Skill by skill" columns={bySkill()} rows={skills} rowKey={(s) => s.code} more={{ page: 1, href: () => "" }} limit={skills.length} />
      <p className="b-caption mt-2">Ready next shows only links a person confirmed.</p>
      <h3 className="mt-4 mb-2 text-[16px]">Level by sitting</h3>
      <FilterBar action={here({})} filters={[{ name: "skill", label: "Skill", value: skill?.code, all: "", required: true, options: skills.map((s) => [s.code, s.name] as const) }]} />
      <Trend sittings={sittings} empty="No sitting with a level named yet" />
    </>
  );
  const notesTab = (
    <>
      {entries.length === 0 ? <EmptyState>Nothing seen yet for this child.</EmptyState> : <Timeline entries={[...entries].reverse().map((e) => ({ kind: e.kind, title: e.title, line: e.line, when: e.when, more: e.more }))} />}
      {older ? (
        <p className="mt-2">
          <Link data-more href={here({ skill: skill?.code, before: older, tab: "notes" })}>Older entries</Link>
        </p>
      ) : null}
    </>
  );
  const papersTab = (
    <>
      <Papers c={c} />
      <h3 className="mt-4 mb-2 text-[16px]">Answers</h3>
      <Answers rows={evidence} names={mistakes} skills={Object.fromEntries(skills.map((s) => [s.code, s.name]))} page={answersPage} href={(n) => here({ skill: skill?.code, before: sp.before, answers: String(n), tab: "papers" })} />
    </>
  );
  return (
    <Screen
      stage={`${c.section} · Sr. No. ${c.roll} · ${c.name}`}
      title="Where this child is"
      purpose="The class picture's child panel, full page: each skill by where they stand, what was seen, their papers and report."
      action={<Link href={`/children/${classId}?${new URLSearchParams({ open: `child:${c.roll}` })}`} className="btn secondary">Back to the class</Link>}
    >
      <DetailPanel inline open={childOpened(c, { tab: sp.tab, note: "/today", more: { skills: skillsTab, notes: notesTab, papers: papersTab } })} summary={{ title: "", stats: [] }} />
    </Screen>
  );
}

function columns(href: (code: string) => string): Column<ChildSkill>[] {
  return [
    { key: "skill", label: "Skill", keep: true, value: (s) => s.name, cell: (s) => <Link href={href(s.code)} data-skill-row className="inline-flex min-h-[var(--tap)] items-center">{s.name}</Link> },
    { key: "state", label: "State", keep: true, status: true, value: (s) => s.words, cell: (s) => <StatusChip state={s.look} round /> },
    { key: "seen", label: "Seen", keep: true, num: true, value: (s) => s.seen },
  ];
}

/** "Skill by skill": the named days behind each skill, when it was last seen and what a person confirmed as next after it. */
function bySkill(): Column<ChildSkill>[] {
  return [
    { key: "skill", label: "Skill", keep: true, value: (s) => s.name },
    { key: "days", label: "Named days", keep: true, num: true, value: (s) => s.seen },
    { key: "last", label: "Last seen", keep: true, value: (s) => (s.lastSeen ? dateWords(s.lastSeen) : "not yet") },
    { key: "next", label: "Ready next", keep: true, value: (s) => s.readyNext.join(", ") || "nothing confirmed yet" },
  ];
}
