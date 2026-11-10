import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KeyValue } from "@/components/key-value";
import { Rail, Screen } from "@/components/app-frame";
import { Question, kindWords } from "@/components/question";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { levels } from "@/lib/levels";
import { questionKinds } from "@/lib/question-types";
import { bankGrid, bankTotals, itemCount, items, type BankRow, type ItemRow } from "@/lib/queries-bank";
import { gradeOf, grades } from "@/lib/queries";
import { gradesOf, ownClasses, scopeOf } from "@/lib/scope";
import type { Column } from "@/lib/ux-rules";

type Q = Record<string, string | undefined>;
const HERE = "/setup/question-bank";
const PER_PAGE = 10;
const n = (x: number) => x.toLocaleString("en-IN");

// Question bank: what is ready to print for the skills taught, by level; open a question to read it as it prints. The
// statistics (counts by skill and level) are behind a fold (rule 8). Queries are the old library page's, unchanged.
export default async function QuestionBank({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const scope = scopeOf(me);
  const [mine, g, lv, { words }] = await deadline(Promise.all([gradesOf(ownClasses(me)), grades(), levels(), questionKinds()]));
  const grid = await deadline(bankGrid(scope));
  const totals = await deadline(bankTotals(scope));
  // a grade filter; a person with classes of their own opens on their grade
  const gradeChoices = g.list.filter((x) => grid.some((r) => r.band === x.code)).map((x): [string, string] => [x.code, x.name]);
  const grade = gradeChoices.some(([c]) => c === q.grade) ? q.grade : q.grade === "all" ? undefined : mine.find((b) => gradeChoices.some(([c]) => c === b));
  const inGrade = (r: BankRow) => !grade || lv.order.some((d) => gradeOf(r, d) === grade);
  const skills = grid.filter((r) => inGrade(r) && Object.values(r.counts).some(Boolean));
  const set = skills.some((r) => r.code === q.skill) ? q.skill : undefined;
  const difficulty = lv.order.includes(q.difficulty ?? "") ? q.difficulty : undefined;
  const find = q.q?.trim().slice(0, 80) || undefined;
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const filter = { set, difficulty, find, scope, grades: grade ? [grade] : undefined };
  const [total, rows] = await deadline(Promise.all([itemCount(filter), items(filter, PER_PAGE, (page - 1) * PER_PAGE)]));
  const keep = { grade: q.grade === "all" ? "all" : grade, skill: set, difficulty, q: find };
  const href = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...keep, page: p > 1 ? String(p) : undefined }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const byLevel = lv.order.map((d) => ({ d, n: skills.reduce((a, r) => a + (r.counts[d] ?? 0), 0) }));

  const columns: Column<ItemRow>[] = [
    {
      key: "question",
      label: "Question",
      // a drawn question has no words; the column is the one that opens it, so it never reads as empty (an empty column is not drawn)
      value: (it) => it.stem || it.item_key,
      cell: (it) => (
        // the key is inside the link: a column sum or a drawn question prints no words, and a link with nothing in it is a control no one can see or name
        <Link href={`${HERE}/${it.item_key}`} data-question-row="" className="block" {...(it === rows[0] ? { "data-ux": "action" } : {})}>
          <Question it={it} />
          <span className="num block text-[13px] text-[var(--ink-muted)]">{it.item_key}</span>
        </Link>
      ),
    },
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
      rail={<Rail edges={set ? [{ screen: "skill", params: { code: set }, label: "The skill", icon: "skill" }] : []} />}
      next={{ href: "/setup/curriculum", label: "Curriculum" }}
    >
      <div className="mb-4 grid gap-3">
        <Details summary="Read what the bank is" name="what-the-bank-is">
          <p className="text-[14px]">
            Every question a paper can print. The engine makes each question from its skill&rsquo;s rule for that level, and a computer checks every answer before it is kept. A removed question is kept with its reason and never printed again. {n(totals.active)} are ready for the skills taught, {n(totals.retired)} removed.
          </p>
        </Details>
        <KeyValue rows={byLevel.map((l) => ({ label: l.d, value: n(l.n), num: true }))} />
      </div>
      <FilterBar
        action={HERE}
        filters={[
          { name: "grade", label: "Grade", value: grade, all: "Every grade", options: gradeChoices },
          { name: "skill", label: "Skill", value: set, all: "All skills taught", options: skills.map((r): [string, string] => [r.code, r.name]) },
          { name: "difficulty", label: "Difficulty", value: difficulty, all: "All", options: lv.order.map((d): [string, string] => [d, d]) },
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
        <Details summary="Statistics (counts and worksheets by taxonomy)" name="statistics">
          <p className="mb-2 text-[13px] text-[var(--ink-muted)]">Questions ready to print, by grade and level.</p>
          <DataTable label="Questions by grade and level" columns={statColumns} rows={stats} rowKey={(r) => r.band} more={{ page: 1, href: () => HERE }} />
        </Details>
      </div>
    </Screen>
  );
}
