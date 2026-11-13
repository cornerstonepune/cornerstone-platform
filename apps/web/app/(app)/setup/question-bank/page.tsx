import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { LevelBars } from "@/components/level-bars";
import { Timeline } from "@/components/timeline";
import { changedLately } from "@/lib/setup-overview";
import { Screen } from "@/components/app-frame";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { Answers, Question, kindWords } from "@/components/question";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { levels } from "@/lib/levels";
import { questionKinds } from "@/lib/question-types";
import { bankGrid, bankTotals, itemCount, items, type BankRow, type ItemRow } from "@/lib/queries-bank";
import { gradeOf, grades } from "@/lib/queries";
import { gradesOf, ownClasses, scopeOf } from "@/lib/scope";
import type { Column } from "@/lib/ux-rules";
import { questionOpened } from "./question-panel";

type Q = Record<string, string | undefined>;
const HERE = "/setup/question-bank";
const PER_PAGE = 10;
const n = (x: number) => x.toLocaleString("en-IN");

// Question bank, a Workspace (page charter Part C, "Question bank / a question: keep, Workspace"): on the left what is ready to print for
// the skills taught, by level, ten a page; a question opens on the right (`?open=question:<key>`) as it prints, with its answer, the wrong
// answers it catches and, for the coordinator, Correct and Remove; its own address is that panel opened full page. With nothing open the
// right side counts the bank. The statistics (counts by skill and level) are behind a fold (rule 8). Queries are the old library page's.
export default async function QuestionBank({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const scope = scopeOf(me);
  const [mine, g, lv, { words }, lately] = await deadline(Promise.all([gradesOf(ownClasses(me)), grades(), levels(), questionKinds(), changedLately(3, "assessment")]));
  const grid = await deadline(bankGrid(scope));
  const totals = await deadline(bankTotals(scope));
  // a grade filter; a person with classes of their own opens on their grade
  const gradeChoices = g.list.filter((x) => grid.some((r) => r.band === x.code)).map((x): [string, string] => [x.code, x.name]);
  const grade = gradeChoices.some(([c]) => c === q.grade) ? q.grade : q.grade === "all" ? undefined : (mine.find((b) => gradeChoices.some(([c]) => c === b)) ?? gradeChoices[0]?.[0]);
  const inGrade = (r: BankRow) => !grade || lv.order.some((d) => gradeOf(r, d) === grade);
  const skills = grid.filter((r) => inGrade(r) && Object.values(r.counts).some(Boolean));
  const set = skills.some((r) => r.code === q.skill) ? q.skill : undefined;
  const difficulty = lv.order.includes(q.difficulty ?? "") ? q.difficulty : undefined;
  // what each dropdown says it holds: a skill's questions at the levels of the grade shown, a level's across the skills shown
  const levelsOfGrade = (r: BankRow) => lv.order.filter((d) => !grade || gradeOf(r, d) === grade);
  const inSkill = (r: BankRow) => !set || r.code === set;
  const skillCount = (r: BankRow) => levelsOfGrade(r).reduce((a, d) => a + (r.counts[d] ?? 0), 0);
  const levelCount = (d: string) => skills.filter(inSkill).reduce((a, r) => a + (levelsOfGrade(r).includes(d) ? (r.counts[d] ?? 0) : 0), 0);
  const kinds = [...new Set(skills.filter(inSkill).flatMap((r) => r.fmts))].map((f): [string, string] => [f, kindWords(words, f)]).sort((a, b) => a[1].localeCompare(b[1]));
  const fmt = kinds.some(([f]) => f === q.fmt) ? q.fmt : undefined;
  const find = q.q?.trim().slice(0, 80) || undefined;
  const status = q.status === "retired" ? "retired" : undefined;
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const filter = { set, difficulty, fmt, status, find, scope, grades: grade ? [grade] : undefined };
  const [total, rows] = await deadline(Promise.all([itemCount(filter), items(filter, PER_PAGE, (page - 1) * PER_PAGE)]));
  const keep = { grade: q.grade === "all" ? "all" : grade, skill: set, difficulty, fmt, status, q: find };
  const href = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...keep, page: p > 1 ? String(p) : undefined }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  // the address with the filters kept and a question open or none
  const at = (open?: string) => {
    const s = new URLSearchParams(Object.entries({ ...keep, page: page > 1 ? String(page) : undefined, open }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const want = parseOpen(q.open);
  const chosen = want?.kind === "question" ? await questionOpened(me, want.id, { tab: q.tab, closeHref: at(), full: `${HERE}/${want.id}`, back: at(`question:${want.id}`) }) : null;
  const byLevel = lv.order.map((d) => ({ d, n: skills.reduce((a, r) => a + (r.counts[d] ?? 0), 0) }));

  const columns: Column<ItemRow>[] = [
    {
      key: "question",
      label: "Question",
      // a drawn question has no words; the column is the one that opens it, so it never reads as empty (an empty column is not drawn)
      value: (it) => it.stem || it.item_key,
      cell: (it) => (
        // the key is inside the link: a column sum or a drawn question prints no words, and a link with nothing in it is a control no one can see or name
        <Link
          href={at(`question:${it.item_key}`)}
          scroll={false}
          data-question-row=""
          data-open-key={`question:${it.item_key}`}
          aria-current={chosen?.it.item_key === it.item_key ? "true" : undefined}
          className="block"
          {...(it === rows[0] ? { "data-ux": "action" } : {})}
        >
          <Question it={it} />
          <span className="num block text-[13px] text-[var(--ink-muted)]">{it.item_key}</span>
        </Link>
      ),
    },
    { key: "answer", label: "Answer", value: (it) => it.responses.map((r) => r.answer).filter(Boolean).join(" "), cell: (it) => <Answers it={it} />, width: "9rem" },
    { key: "skill", label: "Skill", value: (it) => it.skill_set_name ?? "", width: "13rem" },
    { key: "level", label: "Level", value: (it) => it.difficulty ?? "", width: "6rem" },
    { key: "kind", label: "Kind", value: (it) => kindWords(words, it.fmt), width: "10rem" },
    { key: "status", label: "Status", value: (it) => it.status, cell: (it) => <StatusChip state={it.status === "active" ? "done" : "stopped"} words={it.status === "active" ? "ready" : "removed"} />, status: true, width: "8rem" },
  ];
  type StatRow = { band: string; grade: string; skills: number; counts: Record<string, number> };
  const stats: StatRow[] = g.list
    .filter((x) => skills.some((r) => r.band === x.code))
    .map((x) => {
      const of = skills.filter((r) => r.band === x.code);
      return { band: x.code, grade: x.name, skills: of.length, counts: Object.fromEntries(lv.order.map((d) => [d, of.reduce((a, r) => a + (r.counts[d] ?? 0), 0)])) };
    });
  const statColumns: Column<StatRow>[] = [
    { key: "grade", label: "Grade", value: (r) => r.grade },
    { key: "skills", label: "Skills", value: (r) => r.skills, num: true, width: "6rem" },
    ...lv.order.map((d): Column<StatRow> => ({ key: d, label: d, value: (r) => r.counts[d], num: true, width: "6rem" })),
  ];

  return (
    <Screen
      stage={`Grades 1 to 4 · ${n(totals.active)} ready`}
      title="Question bank"
      purpose="What is in the bank for the skills taught in your classes, by level. Open a question to read it as it prints."
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
      panel={
        <DetailPanel
          open={chosen?.opened ?? null}
          summary={{
            title: "What is in the bank",
            stats: [
              { id: "ready", n: totals.active, line: "ready to print", tone: "ok" },
              { id: "removed", n: totals.retired, line: "removed, kept", tone: "quiet" },
              { id: "skills", n: skills.length, line: skills.length === 1 ? "skill with questions" : "skills with questions" },
            ],
            after: (
              <div className="grid gap-[var(--space-3)]">
                <LevelBars levels={byLevel.map((l, i) => ({ level: i, n: l.n, label: l.d }))} />
                <Details summary="Read what the bank is" name="what-the-bank-is">
                  <p className="text-[14px]">
                    Every question a paper can print. The engine makes each question from its skill&rsquo;s rule for that level, and a computer checks every answer before it is kept. A removed question is kept with its reason and never printed again. {n(totals.active)} are ready for the skills taught, {n(totals.retired)} removed.
                  </p>
                </Details>
                {lately.length ? (
                  <section aria-label="Changed lately">
                    <h3 className="mb-[var(--space-1)] text-[14px]">Changed lately</h3>
                    <Timeline entries={lately.map((c) => ({ kind: c.kind, title: c.title, line: `By ${c.by}`, when: c.at }))} />
                  </section>
                ) : null}
                <p className="b-label b-muted">Choose a question to read it here as it prints.</p>
              </div>
            ),
          }}
        />
      }
    >
      <FilterBar
        action={HERE}
        filters={[
          { name: "grade", label: "Grade", value: grade, all: "Every grade", options: gradeChoices, starting: !q.grade },
          { name: "skill", label: "Skill", value: set, all: "All skills taught", options: skills.map((r): [string, string] => [r.code, `${r.name} (${n(skillCount(r))})`]) },
          { name: "difficulty", label: "Difficulty", value: difficulty, all: "All", options: lv.order.map((d): [string, string] => [d, `${d} (${n(levelCount(d))})`]) },
          { name: "fmt", label: "Kind", value: fmt, all: "Any kind", options: kinds },
          { name: "status", label: "Status", value: status, all: "Ready to print", options: [["retired", "Removed"]] },
        ]}
        search={{ name: "q", value: find, placeholder: "Words or code" }}
        keep={{ ...(q.grade === "all" ? { grade: "all" } : {}) }}
      />
      {rows.length === 0 ? (
        <EmptyState next={{ href: HERE, label: "Clear the choices" }}>No questions for this skill yet</EmptyState>
      ) : (
        <DataTable label="Questions" columns={columns} rows={rows} rowKey={(it) => it.item_key} more={{ page, href, of: total }} extras={{ attrs: (it) => ({ "data-row": it.item_key }) }} />
      )}
      <div className="mt-4" id="statistics">
        <Details summary="Statistics (counts and worksheets by topic)" name="statistics">
          <p className="mb-2 text-[13px] text-[var(--ink-muted)]">Questions ready to print, by grade and level.</p>
          <DataTable label="Questions by grade and level" columns={statColumns} rows={stats} rowKey={(r) => r.band} more={{ page: 1, href: () => HERE }} />
        </Details>
      </div>
    </Screen>
  );
}
