import { notFound } from "next/navigation";
import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar, type Filter } from "@/components/filter-bar";
import { Notice, Panel } from "@/components/parts";
import { StatusChip, type State } from "@/components/status-chip";
import { EngineDown, engineGet } from "@/lib/engine";
import { staffList } from "@/lib/queries";
import { paperHref } from "@/lib/assessment-ui";
import { costOf, Printed, type Q, type Review } from "./printed";
import { approveThisPaper, changeThisPaper } from "./actions";

// A copy before it prints, on the paper screen: its questions in order, each drawn as it prints, Remove on each, the bank's dropdowns to add
// one, and the copy approved in the educator's name. (The old review page, moved; Nimish, 2026-10-27: "When a teacher generates an
// assessment, they should see a page where they can look at the actual questions, and that should have an add/remove button".)
// The bank's dropdowns write their choice into this screen's own address under an `e` prefix, so they never meet the paper's own.

type Bank = { topics: { code: string; name: string }[]; skills: { code: string; name: string }[]; levels: { code: string }[]; kinds: { code: string; words: string }[]; questions: Q[] };

const STATE: Record<Review["state"], [State, string]> = {
  waiting: ["toApprove", "waiting for approval"],
  approved: ["approved", "approved, not printed yet"],
  printed: ["printed", "printed"],
  replaced: ["replaced", "replaced by a newer one"],
};

async function read<T>(path: Parameters<typeof engineGet>[0]): Promise<T | string> {
  try {
    const res = await engineGet(path);
    if (res.status === 404) notFound();
    return res.ok ? ((await res.json()) as T) : `The engine could not show this paper (${res.status}).`;
  } catch (e) {
    return e instanceof EngineDown ? e.message : "The engine could not show this paper.";
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const short = (s: string) => (s.length > 70 ? `${s.slice(0, 68)}…` : s);

export async function EditPaper({ qr, assessment, roll, sp }: { qr: string; assessment: string; roll: string; sp: Record<string, string | string[] | undefined> }) {
  const here = paperHref(assessment, roll);
  const [topic, skill, level, kind, pick] = ["etopic", "eskill", "elevel", "ekind", "eq"].map((k) => one(sp[k]));
  const r = await read<Review>(`/paper/${qr}/review`);
  if (typeof r === "string") return <p className="note">{r}</p>;
  const editable = !r.why_not;
  const query = new URLSearchParams(Object.entries({ topic, skill, level, kind }).filter((e): e is [string, string] => !!e[1]));
  const bank = editable ? await read<Bank>(`/paper/${qr}/bank?${query}`) : null;
  const b = typeof bank === "string" || !bank ? null : bank;
  const valid = <T,>(v: string | undefined, rows: T[] | undefined, key: (t: T) => string) => (v && rows?.some((x) => key(x) === v) ? v : undefined);
  const chosen = b?.questions.find((x) => x.id === pick);
  const filters: Filter[] = b
    ? [
        { name: "etopic", label: "Topic", all: "Choose a topic", value: valid(topic, b.topics, (t) => t.code), options: b.topics.map((t) => [t.code, t.name] as const) },
        ...(topic ? [{ name: "eskill", label: "Skill", all: "Choose a skill", value: valid(skill, b.skills, (s) => s.code), options: b.skills.map((s) => [s.code, s.name] as const) }] : []),
        ...(skill ? [{ name: "elevel", label: "Level", all: "Choose a level", value: valid(level, b.levels, (l) => l.code), options: b.levels.map((l) => [l.code, l.code] as const) }] : []),
        ...(level && b.kinds.length > 1 ? [{ name: "ekind", label: "Kind of question", all: "Any kind", value: valid(kind, b.kinds, (k) => k.code), options: b.kinds.map((k) => [k.code, k.words] as const) }] : []),
        ...(level
          ? [{ name: "eq", label: "Question", all: b.questions.length ? "Choose a question" : "None left at this level", value: chosen?.id, options: b.questions.map((x) => [x.id, short(x.text) + (x.days != null ? ` · given ${x.days} ${x.days === 1 ? "day" : "days"} ago` : "")] as const) }]
          : []),
      ]
    : [];
  const n = r.questions.length;
  const done = one(sp.done);
  const gone = [sp.gone ?? []].flat();
  const hidden = (extra: Record<string, string>) =>
    Object.entries({ qr: r.qr, key: assessment, roll, ...extra }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <section aria-label="Questions on this paper" className="mb-6">
      {done ? (
        <Notice tone="neem">
          {done === "approved" ? "Approved in your name: it may be printed now." : `${done === "add" ? "Added" : "Removed"}: the paper now holds ${one(sp.n)} questions.`}
          {gone.map((g) => ` ${g} now has no question.`).join("")}
          {one(sp.withdrew) ? " Its approval was withdrawn: it waits for approval again." : ""}
        </Notice>
      ) : null}
      {one(sp.error) ? <Notice tone="terracotta">{one(sp.error)}</Notice> : null}
      <div data-summary className="mb-3 flex flex-wrap items-center gap-3 text-[14px]">
        <StatusChip state={STATE[r.state][0]} words={STATE[r.state][1]} />
        <span data-count-questions={n}>{`${n} ${n === 1 ? "question" : "questions"}`}</span>
        <span className="text-basalt/70">{r.covers.map((c) => `${c.name} · ${c.level} (${c.n})`).join(" · ")}</span>
        {r.state === "waiting" && editable ? (
          <form action={approveThisPaper}>
            {hidden({})}
            <button className="btn" type="submit" data-approve-paper="">Approve this home assessment</button>
          </form>
        ) : null}
      </div>
      {r.why_not ? <Notice tone="terracotta">{r.why_not}</Notice> : null}
      {r.state === "approved" && editable ? (
        <p className="note mb-3">Approved by {(await staffList()).find((x) => x.email === r.approved_by)?.name ?? r.approved_by}. Changing it withdraws the approval: it then waits for approval again.</p>
      ) : null}
      {n ? (
        <DataTable
          label="The paper's questions"
          rows={r.questions.map((x, i) => ({ ...x, n: i + 1 }))}
          rowKey={(x) => x.id}
          more={{ page: Math.max(1, Number(one(sp.p)) || 1), href: (p: number) => `${here}?p=${p}` }}
          extras={{ attrs: (x) => ({ "data-item": x.item_key, id: `q-${x.id}` }) }}
          columns={[
            { key: "n", label: "#", num: true, width: "3rem", value: (x) => x.n },
            { key: "q", label: "Question", value: (x) => x.text, cell: (x) => <Printed q={x} /> },
            { key: "skill", label: "Skill", width: "14rem", value: (x) => `${x.skill ?? x.skill_set} · ${x.topic_name ?? ""}` },
            { key: "level", label: "Level", width: "6rem", value: (x) => x.level },
            { key: "kind", label: "Kind", width: "10rem", value: (x) => x.kind_words },
            ...(editable
              ? [
                  {
                    key: "remove",
                    label: "",
                    keep: true,
                    width: "10rem",
                    value: () => "Remove",
                    cell: (x: Q) => {
                      const cost = costOf(r, x);
                      return cost && one(sp.confirm) !== x.id ? (
                        <Link href={`${here}?confirm=${x.id}#q-${x.id}`} className="btn secondary" data-remove-question="">Remove</Link>
                      ) : (
                        <form action={changeThisPaper} data-confirm={cost ? "" : undefined}>
                          {hidden({ item_id: x.id, what: "remove" })}
                          {cost ? <p className="mb-1 max-w-[36ch] text-[12.5px]">{cost}</p> : null}
                          <button className="btn secondary" type="submit" data-remove-question="">{cost ? "Yes, remove it" : "Remove"}</button>
                        </form>
                      );
                    },
                  },
                ]
              : []),
          ]}
        />
      ) : (
        <EmptyState>This paper holds no question.</EmptyState>
      )}
      {editable && b ? (
        <section aria-label="Add a question from the bank" className="mt-6">
          <h2 className="mb-2 text-[16px]">Add a question from the bank</h2>
          <FilterBar action={here} filters={filters} />
          {chosen ? (
            <Panel title="See it" label="The chosen question">
              <div className="text-[14px]" data-item={chosen.item_key}>
                <Printed q={chosen} />
              </div>
              <p className="note mt-2">
                {chosen.skill ?? chosen.skill_set} · {chosen.level}
                {chosen.kind_words ? ` · ${chosen.kind_words}` : ""}
              </p>
              {n >= r.max ? (
                <p className="note mt-2">This paper already holds {r.max} questions, the most a paper may hold. Remove one first.</p>
              ) : (
                <form action={changeThisPaper} className="mt-3 flex flex-wrap items-center gap-2">
                  {hidden({ item_id: chosen.id, what: "add" })}
                  <label className="flex items-center gap-2 text-[13px]">
                    Put it
                    <select name="at" defaultValue="" className="select !w-auto">
                      <option value="">at the end</option>
                      {r.questions.map((_, i) => (
                        <option key={i} value={i + 1}>{`before question ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                  <button className="btn" type="submit" data-add-question="">Add</button>
                </form>
              )}
            </Panel>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
