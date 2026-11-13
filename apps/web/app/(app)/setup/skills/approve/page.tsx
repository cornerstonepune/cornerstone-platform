import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KindTile } from "@/components/kind-tile";
import { Screen } from "@/components/app-frame";
import { Timeline } from "@/components/timeline";
import { changedLately } from "@/lib/setup-overview";
import { kindWords } from "@/components/question";
import { requireStaff } from "@/lib/auth";
import { mayDecide } from "@/lib/decides";
import { deadline } from "@/lib/deadline";
import { questionKinds } from "@/lib/question-types";
import { grades as schoolGrades, skillSets, type SkillSet } from "@/lib/queries";
import { chargesTable } from "@/lib/queries-charges";
import { openedAt } from "@/lib/queries-skills";
import { scopeOf } from "@/lib/scope";
import type { Column } from "@/lib/ux-rules";
import { approveSkills } from "../../../skill-sets/[code]/actions";
import { LevelsTab } from "./levels-tab";
import { skillOpened } from "./skill-panel";

type Q = Record<string, string | undefined>;
const HERE = "/setup/skills/approve";

// Skills to approve, a Workspace (page charter Part C: "keep, Workspace; one skill at a time on the right"). On the left every skill whose
// levels wait for a person, by subject, ten a page; choosing one opens it on the right (`?open=skill:<code>`) with its levels and its own
// Approve (Nimish: no bulk button over the rows; every approval is separate), and an approval comes back with the next skill open. The count
// of what waits is this screen's eyebrow and is shown nowhere else. The queries and the approval are the old page's, unchanged.
export default async function SkillsToApprove({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const tab = q.tab === "levels" ? "levels" : "skills";
  const [sets, charges, mayApprove, school, { words }, opened, lately] = await deadline(
    Promise.all([
      skillSets({ untaught: true, scope: scopeOf(me) }),
      chargesTable(),
      mayDecide(me, "skills"),
      schoolGrades(),
      questionKinds(),
      openedAt(),
      changedLately(3, "skill"),
    ]),
  );
  const waiting = sets.filter((s) => s.status !== "ratified");
  const gradeOptions = school.list.filter((g) => waiting.some((x) => x.band === g.code)).map((g): [string, string] => [g.code, g.name]);
  const subjects = [...new Map(waiting.filter((x) => x.subject_code).map((x) => [x.subject_code!, x.subject_name ?? x.subject_code!])).entries()];
  const topics = [
    ...new Map(
      waiting
        .filter((x) => x.topic_code)
        .sort((a, b) => (a.topic_ord ?? 0) - (b.topic_ord ?? 0))
        .map((x) => [x.topic_code!, x.topic_name ?? x.topic_code!]),
    ).entries(),
  ];
  const grade = gradeOptions.some(([g]) => g === q.grade) ? q.grade : undefined;
  const subject = subjects.some(([s]) => s === q.subject) ? q.subject : undefined;
  const topic = topics.some(([t]) => t === q.topic) ? q.topic : undefined;
  const taught = q.taught === "yes" || q.taught === "no" ? q.taught : undefined;
  const order = (x: SkillSet) => school.list.findIndex((g) => g.code === x.band);
  // a skill kept by every choice but `except`, so each dropdown counts what the others leave
  const keeps = (x: SkillSet, except?: "grade" | "subject" | "topic" | "taught") =>
    (except === "grade" || !grade || x.band === grade) &&
    (except === "subject" || !subject || x.subject_code === subject) &&
    (except === "topic" || !topic || x.topic_code === topic) &&
    (except === "taught" || !taught || x.taught === (taught === "yes"));
  const count = (except: "grade" | "subject" | "topic" | "taught", test: (x: SkillSet) => boolean) => waiting.filter((x) => keeps(x, except) && test(x)).length;
  const rows = waiting
    .filter((x) => keeps(x))
    .sort((a, b) => (a.subject_name ?? "").localeCompare(b.subject_name ?? "") || order(a) - order(b) || (a.topic_ord ?? 0) - (b.topic_ord ?? 0) || a.name.localeCompare(b.name));
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const shown = Math.min(page, pages);
  // this list under its choices, on a page, with a skill open or none
  const back = (p: number, open?: string) => {
    const s = new URLSearchParams(
      Object.entries({
        grade,
        subject,
        topic,
        taught,
        page: p > 1 ? String(p) : undefined,
        open,
      }).flatMap(([k, v]) => (v ? [[k, v]] : [])),
    );
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const onPage = rows.slice((shown - 1) * 10, shown * 10);
  const first = onPage[0];
  const bySubject = [...Map.groupBy(onPage, (x) => x.subject_name ?? "Other")];
  const want = parseOpen(q.open);
  const chosen = tab === "skills" && want?.kind === "skill" ? waiting.find((x) => x.code === want.id) : undefined;
  // after an approval the next skill waiting under the same choices opens (the one after this, or the one before at the end); its page of ten
  const at = chosen ? rows.indexOf(chosen) : -1;
  const next = at >= 0 ? (rows[at + 1] ?? rows[at - 1]) : undefined;
  // once this one is approved it leaves the list, so the next one's place is one earlier when it came after it
  const nextAt = next ? rows.indexOf(next) - (rows.indexOf(next) > at ? 1 : 0) : -1;
  const afterApproval = next ? back(Math.floor(nextAt / 10) + 1, `skill:${next.code}`) : back(shown);

  const columns: Column<SkillSet>[] = [
    {
      key: "skill",
      label: "Skill",
      value: (x) => x.name,
      cell: (x) => (
        <span className="flex items-center gap-2">
          <KindTile kind="skill" />
          <Link href={back(shown, `skill:${x.code}`)} scroll={false} data-row-link data-open-key={`skill:${x.code}`} aria-current={chosen?.code === x.code ? "true" : undefined}>
            {x.name}
          </Link>
        </span>
      ),
    },
    {
      key: "grade",
      label: "Grade",
      value: (x) => school.name(x.band),
      width: "7rem",
    },
    {
      key: "topic",
      label: "Topic",
      value: (x) => x.topic_name ?? "",
      width: "10rem",
    },
  ];
  // the one main action: the open skill's Approve (in the panel), else reading the first skill on this page
  const action =
    chosen && mayApprove ? undefined : tab === "skills" && first ? (
      <Link href={back(shown, `skill:${first.code}`)} scroll={false} className="btn" data-read-first>
        Read the first skill
      </Link>
    ) : (
      <p className="text-[length:var(--text-label)]">{tab === "levels" ? "Levels most children are secure at." : "Read, then approve one at a time."}</p>
    );

  // what a wrong answer counts against, read and approved beside the list (the summary on the right): never with a skill open, so the
  // panel's one Approve is the skill's
  const chargesBox = charges.rows.length ? (
    <div className="mt-[var(--space-3)]">
      <Details summary="What a wrong answer counts against" name="charges">
        <p className="mb-2 text-[length:var(--text-label)]">
          A wrong answer counts against the part of the skill that broke. {charges.rows.length} belong to something other than the sum they happen in.
        </p>
        <ul className="grid gap-1 text-[length:var(--text-label)]">
          {charges.rows.map((r) => (
            <li key={`${r.kind}-${r.code}`}>
              On a {kindWords(words, r.kind)}, <b>{r.mistake.toLowerCase()}</b> counts against <b>{r.skill}</b>.
            </li>
          ))}
        </ul>
      </Details>
      {q.table === "0" ? (
        <p role="status" className="mt-2 text-[length:var(--text-label)] text-[var(--ink-muted)]">
          The table was not approved: it changed since this page was opened. Read it again, then approve.
        </p>
      ) : null}
      {q.table === "1" ? (
        <p role="status" className="mt-2 text-[length:var(--text-label)] text-[var(--ink-muted)]">
          What a wrong answer counts against is approved, in your name.
        </p>
      ) : null}
      {charges.waiting && mayApprove ? (
        // approved on its own: a press meant for some skills never approves it (the table is sent as shown, so a changed table waits again)
        <form action={approveSkills} className="mt-2">
          <input type="hidden" name="back" value={back(shown)} />
          <input type="hidden" name="opened" value={opened} />
          <input type="hidden" name="charges_table" value={JSON.stringify(charges.table)} />
          <button type="submit" className="btn secondary" data-approve-table="">
            Approve this table as written, as {me.name}
          </button>
        </form>
      ) : null}
    </div>
  ) : null;

  return (
    <Screen
      stage={`${waiting.length} waiting`}
      title="Skills to approve"
      purpose="Read each skill's levels and approve them one at a time. What a wrong answer counts against is shown beside it."
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
      action={action}
      panel={
        <DetailPanel
          open={
            chosen
              ? skillOpened(chosen, {
                  grade: school.name(chosen.band),
                  mayApprove,
                  opened,
                  back: afterApproval,
                  tab: q.tab,
                  closeHref: back(shown),
                })
              : null
          }
          summary={{
            title: "Waiting for a person",
            stats: [
              {
                id: "shown",
                n: rows.length,
                line: rows.length === waiting.length ? "skills in this list" : "under these choices",
              },
              {
                id: "taught",
                n: rows.filter((x) => x.taught).length,
                line: "taught in a class",
              },
              {
                id: "subjects",
                n: new Set(rows.map((x) => x.subject_name ?? "Other")).size,
                line: "subjects",
              },
            ],
            after: (
              <>
                {chargesBox}
                {lately.length ? (
                  <section aria-label="Approved lately" className="mt-[var(--space-3)]">
                    <h3 className="mb-[var(--space-1)] text-[length:var(--text-label)]">Approved lately</h3>
                    <Timeline
                      entries={lately.map((c) => ({
                        kind: c.kind,
                        title: c.title,
                        line: `By ${c.by}`,
                        when: c.at,
                      }))}
                    />
                  </section>
                ) : null}
              </>
            ),
          }}
        />
      }
    >
      <nav role="tablist" aria-label="List" className="mb-3 flex gap-2">
        <Link role="tab" aria-selected={tab === "skills"} href={HERE} className={`chip ${tab === "skills" ? "on" : ""}`}>
          Skills
        </Link>
        <Link role="tab" aria-selected={tab === "levels"} href={`${HERE}?tab=levels`} className={`chip ${tab === "levels" ? "on" : ""}`}>
          Levels to review
        </Link>
      </nav>
      {q.approved === "0" ? (
        <p role="status" className="mb-3 text-[length:var(--text-label)] text-[var(--ink-muted)]">
          Nothing was approved: it changed since this page was opened. Read it again, then approve.
        </p>
      ) : null}
      {q.approved === "1" ? (
        <p role="status" className="mb-3 text-[length:var(--text-label)] text-[var(--ink-muted)]">
          Approved, in your name.{chosen ? " The next skill is open." : ""}
        </p>
      ) : null}
      {tab === "levels" ? (
        <LevelsTab q={q} />
      ) : (
        <>
          <FilterBar
            action={HERE}
            filters={[
              {
                name: "grade",
                label: "Grade",
                value: grade,
                all: "Every grade",
                options: gradeOptions.map(([c, w]): [string, string] => [c, `${w} (${count("grade", (x) => x.band === c)})`]),
              },
              {
                name: "subject",
                label: "Subject",
                value: subject,
                all: "Every subject",
                options: subjects,
              },
              {
                name: "topic",
                label: "Topic",
                value: topic,
                all: "Every topic",
                options: topics.map(([c, w]): [string, string] => [c, `${w} (${count("topic", (x) => x.topic_code === c)})`]),
              },
              {
                name: "taught",
                label: "Taught",
                value: taught,
                all: "Taught or not",
                options: [
                  ["yes", `Taught (${count("taught", (x) => x.taught)})`],
                  ["no", `Not taught yet (${count("taught", (x) => !x.taught)})`],
                ],
              },
            ]}
          />
          {rows.length === 0 ? (
            <EmptyState next={{ href: "/setup/curriculum", label: "Curriculum" }}>Nothing to approve</EmptyState>
          ) : (
            // the rows by subject, each subject its own table headed by its name and how many wait; ten rows a page across them
            <div className="grid gap-4" data-block="DataTable">
              {bySubject.map(([name, group]) => (
                <section key={name} aria-label={name} data-subject={name}>
                  <h2 className="mb-1 flex items-center gap-2 text-[length:var(--text-body)]">
                    {name}
                    <span className="b-count b-num">{rows.filter((x) => (x.subject_name ?? "Other") === name).length}</span>
                  </h2>
                  <DataTable
                    label={`Skills waiting for approval · ${name}`}
                    columns={columns}
                    rows={group}
                    rowKey={(x) => x.code}
                    more={{ page: 1, href: (p: number) => back(p) }}
                    extras={{ attrs: (x) => ({ "data-row": x.code }) }}
                  />
                </section>
              ))}
              {pages > 1 ? (
                <nav className="flex items-center gap-3 text-[length:var(--text-label)]" aria-label="Skills waiting for approval pages">
                  {shown > 1 ? (
                    <Link href={back(shown - 1)} className="chip">
                      ← Earlier
                    </Link>
                  ) : null}
                  <span>
                    Page {shown} of {pages}
                  </span>
                  {shown < pages ? (
                    <Link href={back(shown + 1)} className="chip">
                      Later →
                    </Link>
                  ) : null}
                </nav>
              ) : null}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
