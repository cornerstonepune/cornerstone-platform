import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { Panel } from "@/components/parts";
import { Question, kindWords } from "@/components/question";
import type { Column } from "@/lib/ux-rules";
import { kindsInWords } from "../../../worksheets/library";
import { sheetWords } from "../../../worksheets/[qr]/library-sheet";
import type { levelExamples, skillKinds, skillMistakes } from "@/lib/queries-skills";
import type { worksheets } from "@/lib/queries-worksheets";
import type { SkillSet } from "@/lib/queries";
import { levelsOf } from "@/lib/queries";

// What sits under a skill set's levels on its screen: the kinds of question, the mistakes it watches for and its worksheets, one level at a
// time. Read as the old page read them; the tables are the site's one table (DataTable).
type Words = Record<string, string>;
type Kind = Awaited<ReturnType<typeof skillKinds>>[number];
type Sheet = Awaited<ReturnType<typeof worksheets>>[number];
export type Mistaken = Awaited<ReturnType<typeof skillMistakes>>[number] & { said: { name: string; description: string | null } };
type Example = Awaited<ReturnType<typeof levelExamples>>[number];
const ALL_ON_ONE_PAGE = 500;

export function KindsPanel({ kinds, words }: { kinds: Kind[]; words: Words }) {
  const columns: Column<Kind>[] = [
    { key: "kind", label: "Kind", value: (k) => kindWords(words, k.fmt) },
    { key: "example", label: "For example", value: (k) => k.item_key, cell: (k) => <Link href={`/library/${k.item_key}`} className="text-basalt no-underline"><Question it={k as unknown as Example} /></Link> },
    { key: "n", label: "Questions", value: (k) => k.n, num: true },
  ];
  return (
    <Panel title="Kinds of question" aside={`${kinds.length} ${kinds.length === 1 ? "kind" : "kinds"}`}>
      <DataTable label="Kinds of question" columns={columns} rows={kinds} rowKey={(k) => k.fmt} limit={ALL_ON_ONE_PAGE} more={{ page: 1, href: () => "#" }} />
    </Panel>
  );
}

function Mistake({ name, example, n }: { name: string; example: string | null; n: number }) {
  return (
    <li className="grid gap-[2px] text-[13.5px]">
      <span>{name}</span>
      {example ? <span className="text-basalt/70">{example}</span> : null}
      <span className="note">
        caught by {n} {n === 1 ? "question" : "questions"}
      </span>
    </li>
  );
}

export function MistakesList({ mistakes }: { mistakes: Mistaken[] }) {
  const list = (ms: Mistaken[]) => ms.map((m) => <Mistake key={m.code} name={m.said.name} example={m.said.description} n={m.n} />);
  return mistakes.length ? (
    <>
      <ul className="grid gap-3">{list(mistakes.slice(0, 6))}</ul>
      {mistakes.length > 6 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13.5px]">{mistakes.length - 6} more mistakes</summary>
          <ul className="mt-3 grid gap-3">{list(mistakes.slice(6))}</ul>
        </details>
      ) : null}
    </>
  ) : (
    <p className="note">This skill is marked by a person reading the child&rsquo;s words, so no wrong answer names a mistake on its own.</p>
  );
}

export function WorksheetsPanel({ s, shown, shownLevel, words }: { s: SkillSet; shown: Sheet[]; shownLevel: string | undefined; words: Words }) {
  const columns: Column<Sheet>[] = [
    {
      key: "sheet",
      label: "Worksheet",
      value: (w) => w.code,
      // named by its level and number; the code printed on the sheet beside it
      cell: (w) => (
        <>
          <Link href={`/worksheets/${w.code}`}>
            {w.difficulty} · {sheetWords(w.code)}
          </Link>{" "}
          <span className="fact text-[11px] text-basalt/45">{w.code}</span>
        </>
      ),
    },
    { key: "level", label: "Level", value: (w) => w.difficulty, num: true },
    { key: "kinds", label: "Its twelve questions", value: (w) => kindsInWords(w.kinds, words) },
  ];
  const here = `/setup/skill-sets/${s.code}`;
  return (
    <section id="worksheets" className="scroll-mt-6">
      <Panel title="Worksheets" aside={`${shown.length} ${shownLevel ? `at ${shownLevel}` : "at every level"}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Show worksheets for">
          <Link href={`${here}?level=all#worksheets`} className={`chip ${shownLevel ? "" : "on"}`}>
            Every level
          </Link>
          {levelsOf(s).map((d) => (
            <Link key={d} href={`${here}?level=${d}#worksheets`} className={`chip ${shownLevel === d ? "on" : ""}`}>
              {d} · {s.worksheets[d] ?? 0}
            </Link>
          ))}
        </div>
        {shown.length ? (
          <DataTable label="Worksheets for this skill" columns={columns} rows={shown} rowKey={(w) => w.code} limit={ALL_ON_ONE_PAGE} more={{ page: 1, href: () => "#" }} />
        ) : (
          <p className="note">No worksheets at this level: it holds too few questions to fill one.</p>
        )}
      </Panel>
    </section>
  );
}
