import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KindTile } from "@/components/kind-tile";
import { Screen, Rail, type Edge } from "@/components/app-frame";
import { kindWords } from "@/components/question";
import { requireStaff } from "@/lib/auth";
import { mayDecide } from "@/lib/decides";
import { deadline } from "@/lib/deadline";
import { questionKinds } from "@/lib/question-types";
import { grades as schoolGrades, levelsOf, skillSets, type SkillSet } from "@/lib/queries";
import { chargesTable } from "@/lib/queries-charges";
import { openedAt } from "@/lib/queries-skills";
import { scopeOf } from "@/lib/scope";
import type { Column } from "@/lib/ux-rules";
import { approveSkills } from "../../../skill-sets/[code]/actions";
import { LevelsTab } from "./levels-tab";

type Q = Record<string, string | undefined>;
const HERE = "/setup/skills/approve";
const RAIL: Edge[] = [{ screen: "curriculum", label: "Curriculum", icon: "objective" }];

// Skills to approve: every skill whose levels wait for a person, read and approved one row at a time (Nimish: no bulk
// button over the rows; every approval is separate). The count of what waits is this screen's eyebrow and is shown nowhere
// else. The queries and the approval are the old page's, unchanged; the page is the frame and the blocks.
export default async function SkillsToApprove({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const tab = q.tab === "levels" ? "levels" : "skills";
  const [sets, charges, mayApprove, school, { words }, opened] = await deadline(
    Promise.all([skillSets({ untaught: true, scope: scopeOf(me) }), chargesTable(), mayDecide(me, "skills"), schoolGrades(), questionKinds(), openedAt()]),
  );
  const waiting = sets.filter((s) => s.status !== "ratified");
  const gradeOptions = school.list.filter((g) => waiting.some((x) => x.band === g.code)).map((g): [string, string] => [g.code, g.name]);
  const subjects = [...new Map(waiting.filter((x) => x.subject_code).map((x) => [x.subject_code!, x.subject_name ?? x.subject_code!])).entries()];
  const grade = gradeOptions.some(([g]) => g === q.grade) ? q.grade : undefined;
  const subject = subjects.some(([s]) => s === q.subject) ? q.subject : undefined;
  const order = (x: SkillSet) => school.list.findIndex((g) => g.code === x.band);
  const rows = waiting
    .filter((x) => (!grade || x.band === grade) && (!subject || x.subject_code === subject))
    .sort((a, b) => order(a) - order(b) || (a.topic_ord ?? 0) - (b.topic_ord ?? 0) || a.name.localeCompare(b.name));
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const back = (p: number) => {
    const s = new URLSearchParams(Object.entries({ grade, subject, page: p > 1 ? String(p) : undefined }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const first = rows[(Math.min(page, Math.max(1, Math.ceil(rows.length / 10))) - 1) * 10];

  const columns: Column<SkillSet>[] = [
    {
      key: "skill",
      label: "Skill",
      value: (x) => x.name,
      cell: (x) => (
        <span className="flex items-center gap-2">
          <KindTile kind="skill" />
          <Link href={`/setup/skills/${x.code}`} data-row-link>
            {x.name}
          </Link>
        </span>
      ),
    },
    { key: "grade", label: "Grade", value: (x) => school.name(x.band), width: "7rem" },
    {
      key: "levels",
      label: "Its levels",
      value: (x) => levelsOf(x).join(" "),
      cell: (x) => (
        <dl className="grid gap-1 text-[13px] md:grid-cols-[72px_1fr]">
          {levelsOf(x).map((d) => (
            <div key={d} className="contents">
              <dt className="label pt-[2px]">{d}</dt>
              <dd>{x.difficulty[d]?.words}</dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      key: "approve",
      label: "",
      keep: true,
      value: () => "approve",
      cell: (x) =>
        mayApprove ? (
          // this skill alone: the form names the one skill, and the action approves only it
          <form action={approveSkills}>
            <input type="hidden" name="back" value={back(page)} />
            <input type="hidden" name="opened" value={opened} />
            <input type="hidden" name="code" value={x.code} />
            <input type="hidden" name="version" value={x.version} />
            <button type="submit" name="only" value={x.code} className="btn" data-approve="" {...(x === first ? { "data-ux": "action" } : {})}>
              Approve<span className="sr-only"> {x.name}</span>
            </button>
          </form>
        ) : null,
      width: "9rem",
    },
  ];

  return (
    <Screen
      stage={`${waiting.length} waiting`}
      title="Skills to approve"
      purpose="Read each skill's levels and approve them one at a time. What a wrong answer counts against is shown beside it."
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
      rail={<Rail edges={RAIL} />}
      action={tab === "levels" || !first || !mayApprove ? <p className="text-[14px]">{tab === "levels" ? "Levels most children are secure at." : "Read, then approve one at a time."}</p> : undefined}
    >
      <nav role="tablist" aria-label="List" className="mb-3 flex gap-2">
        <Link role="tab" aria-selected={tab === "skills"} href={HERE} className={`chip ${tab === "skills" ? "on" : ""}`}>
          Skills
        </Link>
        <Link role="tab" aria-selected={tab === "levels"} href={`${HERE}?tab=levels`} className={`chip ${tab === "levels" ? "on" : ""}`}>
          Levels to review
        </Link>
      </nav>
      {q.approved === "0" ? <p role="status" className="mb-3 text-[13px] text-[var(--ink-muted)]">Nothing was approved: it changed since this page was opened. Read it again, then approve.</p> : null}
      {tab === "levels" ? (
        <LevelsTab q={q} />
      ) : (
        <>
          <FilterBar
            action={HERE}
            filters={[
              { name: "grade", label: "Grade", value: grade, all: "Every grade", options: gradeOptions },
              { name: "subject", label: "Subject", value: subject, all: "Every subject", options: subjects },
            ]}
          />
          {rows.length === 0 ? (
            <EmptyState next={{ href: "/setup/curriculum", label: "Curriculum" }}>Nothing to approve</EmptyState>
          ) : (
            <DataTable label="Skills waiting for approval" columns={columns} rows={rows} rowKey={(x) => x.code} more={{ page, href: back }} extras={{ attrs: (x) => ({ "data-row": x.code }) }} />
          )}
        </>
      )}
      {charges.rows.length ? (
        <div className="mt-4">
          <Details summary="What a wrong answer counts against" name="charges">
            <p className="mb-2 text-[14px]">A wrong answer counts against the part of the skill that broke. {charges.rows.length} belong to something other than the sum they happen in.</p>
            <ul className="grid gap-1 text-[13px]">
              {charges.rows.map((r) => (
                <li key={`${r.kind}-${r.code}`}>
                  On a {kindWords(words, r.kind)}, <b>{r.mistake.toLowerCase()}</b> counts against <b>{r.skill}</b>.
                </li>
              ))}
            </ul>
          </Details>
        </div>
      ) : null}
    </Screen>
  );
}
