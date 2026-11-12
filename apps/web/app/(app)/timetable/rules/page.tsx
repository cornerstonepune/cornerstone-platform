import { Screen } from "@/components/app-frame";
import { TimetableRail } from "@/components/timetable-rail";
import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { FilterBar } from "@/components/filter-bar";
import { KeyValue } from "@/components/key-value";
import type { Column } from "@/lib/ux-rules";
import { requireStaff } from "@/lib/auth";
import { EngineDown } from "@/lib/engine";
import { schoolZone } from "@/lib/school-clock";
import { type Block, type Edit, type Fixed, type Limit, type Rules, blockWhen, day, DAYS, rulesOf, standing } from "@/lib/timetable-rules";
import { changeRule } from "./actions";
import "../timetable.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const name = (code: string) => code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const when = (iso: string, zone: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zone });

function said(e: Edit): string {
  const a = (e.after ?? e.before ?? {}) as Record<string, unknown>;
  const verb = e.action === "remove" ? "removed" : e.before ? "changed" : "added";
  const what = { period: `period ${a.label ?? ""}`, block: `a block (${a.reason ?? ""})`, limit: `a limit on ${name(String(a.subject_code ?? ""))}`, fixed: `a fixed slot (${a.text ?? ""})` }[e.rule];
  return `${e.who} ${verb} ${what}`;
}

function Hidden({ rule, rules, action = "set", id }: { rule: string; rules: Rules; action?: string; id?: string }) {
  return (
    <>
      <input type="hidden" name="class_id" value={rules.class.id} />
      <input type="hidden" name="rule" value={rule} />
      <input type="hidden" name="action" value={action} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
    </>
  );
}

const Remove = ({ rule, rules, id, word }: { rule: string; rules: Rules; id: string; word: string }) => (
  <form action={changeRule}>
    <Hidden rule={rule} rules={rules} action="remove" id={id} />
    <button className="quiet">{word}</button>
  </form>
);

type Row = { id: string; rule: "period" | "fixed" | "block" | "limit"; name: string; value: string; by: string };

const limitWords = (l: Limit) => (l.fewest !== null && l.most !== null ? `${l.fewest} to ${l.most} a ${l.span}` : l.fewest !== null ? `at least ${l.fewest} a ${l.span}` : l.most !== null ? `at most ${l.most} a ${l.span}` : `no limit a ${l.span}`);

/** Who last changed each rule row and when: the newest edit that names it, read from the history. */
function lastChanges(rules: Rules, zone: string): Map<string, string> {
  const latest = new Map<string, Edit>();
  for (const e of rules.history) {
    const id = String((e.after ?? e.before ?? {}).id ?? "");
    if (id && (!latest.has(id) || e.at > latest.get(id)!.at)) latest.set(id, e);
  }
  return new Map([...latest].map(([id, e]) => [id, `${e.who} · ${when(e.at, zone)}`]));
}

function rowsOf(rules: Rules, by: Map<string, string>) {
  const who = (id: string) => by.get(id) ?? "–";
  return {
    period: [
      ...rules.periods.map((p): Row => ({ id: p.id, rule: "period", name: p.label, value: `${p.starts_at} to ${p.ends_at ?? "–"}${p.fixed ? " · fixed" : ""}`, by: who(p.id) })),
      ...rules.fixed.map((f: Fixed): Row => ({ id: f.id, rule: "fixed", name: `${f.label}: ${f.text}`, value: `Week ${f.week}, ${day(f.weekday)}`, by: who(f.id) })),
    ],
    block: rules.blocks.map((b: Block): Row => ({ id: b.id, rule: "block", name: b.reason, value: `${blockWhen(b)}, ${b.period ?? "all day"}`, by: who(b.id) })),
    limit: rules.limits.map((l: Limit): Row => {
      const s = standing(l, rules.placed);
      return { id: l.id, rule: "limit", name: name(l.subject_code), value: `${limitWords(l)} · ${s.now} placed, ${s.state === "within" ? "within" : s.state}`, by: who(l.id) };
    }),
  };
}

/** What opens under a row when its Edit was chosen: the row's own fields with Save, and Cancel to close it. */
function EditRow({ row, rules, back }: { row: Row; rules: Rules; back: string }) {
  const cancel = <Link href={back} className="btn secondary">Cancel</Link>;
  if (row.rule === "period") {
    const p = rules.periods.find((x) => x.id === row.id)!;
    return (
      <form action={changeRule} className="tt-row" aria-label={`Edit period ${p.label}`}>
        <Hidden rule="period" rules={rules} id={p.id} />
        <label>Name<input name="label" defaultValue={p.label} required /></label>
        <label>Starts<input type="time" name="starts_at" defaultValue={p.starts_at} required /></label>
        <label>Ends<input type="time" name="ends_at" defaultValue={p.ends_at ?? ""} /></label>
        <button>Save</button>
        {cancel}
      </form>
    );
  }
  if (row.rule === "limit") {
    const l = rules.limits.find((x) => x.id === row.id)!;
    return (
      <div className="tt-row">
        <form action={changeRule} className="tt-row" aria-label={`Edit the limit on ${name(l.subject_code)}`}>
          <Hidden rule="limit" rules={rules} />
          <input type="hidden" name="subject_code" value={l.subject_code} />
          <label>Per<select name="span" defaultValue={l.span}><option value="week">Week</option><option value="fortnight">Fortnight</option></select></label>
          <label>Fewest<input type="number" name="fewest" min={0} defaultValue={l.fewest ?? ""} /></label>
          <label>Most<input type="number" name="most" min={0} defaultValue={l.most ?? ""} /></label>
          <button>Save</button>
        </form>
        <Remove rule="limit" rules={rules} id={l.id} word="Remove this limit" />
        {cancel}
      </div>
    );
  }
  if (row.rule === "fixed") {
    const f = rules.fixed.find((x) => x.id === row.id)!;
    return (
      <div className="tt-row">
        <form action={changeRule} className="tt-row" aria-label={`Edit the fixed slot ${f.label}`}>
          <Hidden rule="fixed" rules={rules} />
          <input type="hidden" name="week_code" value={f.week} />
          <input type="hidden" name="weekday" value={f.weekday} />
          <input type="hidden" name="period_id" value={f.period_id} />
          <label>What is fixed<input name="text" defaultValue={f.text} required /></label>
          <button>Save</button>
        </form>
        <Remove rule="fixed" rules={rules} id={f.id} word="Release this slot" />
        {cancel}
      </div>
    );
  }
  return (
    <div className="tt-row">
      <p className="tt-note">To change a blocked day, remove it and block the new day below.</p>
      <Remove rule="block" rules={rules} id={row.id} word="Remove this block" />
      {cancel}
    </div>
  );
}

function AddRule({ rules }: { rules: Rules }) {
  return (
    <Details summary="Add a rule" id="add" open>
      <form action={changeRule} className="tt-row" aria-label="Block a day">
        <Hidden rule="block" rules={rules} />
        <label>Date<input type="date" name="on_date" /></label>
        <label>Or weekday
          <select name="weekday" defaultValue=""><option value="">None</option>{DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
        </label>
        <label>Week
          <select name="week_code" defaultValue=""><option value="">Both</option><option value="A">A</option><option value="B">B</option></select>
        </label>
        <label>Period
          <select name="period_id" defaultValue=""><option value="">Whole day</option>{rules.periods.map((p) => <option key={p.id} value={p.id}>{p.starts_at} {p.label}</option>)}</select>
        </label>
        <label>Reason<input name="reason" required /></label>
        <button>Block</button>
      </form>
      <form action={changeRule} className="tt-row" aria-label="Set a limit">
        <Hidden rule="limit" rules={rules} />
        <label>Subject<select name="subject_code" required>{rules.subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
        <label>Per<select name="span"><option value="week">Week</option><option value="fortnight">Fortnight</option></select></label>
        <label>Fewest<input type="number" name="fewest" min={0} /></label>
        <label>Most<input type="number" name="most" min={0} /></label>
        <button>Save limit</button>
      </form>
      <form action={changeRule} className="tt-row" aria-label="Pin a slot">
        <Hidden rule="fixed" rules={rules} />
        <label>Week<select name="week_code"><option>A</option><option>B</option></select></label>
        <label>Weekday<select name="weekday">{DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        <label>Period<select name="period_id">{rules.periods.map((p) => <option key={p.id} value={p.id}>{p.starts_at} {p.label}</option>)}</select></label>
        <label>What is fixed<input name="text" required /></label>
        <button>Pin</button>
      </form>
    </Details>
  );
}

export default async function RulesPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const zone = await schoolZone();
  const kind = ["period", "block", "limit", "fixed"].includes(q.kind ?? "") ? q.kind : undefined;
  let rules: Rules | null = null;
  let down: string | null = null;
  try {
    rules = await rulesOf(me.email, q.class || undefined);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    down = e.message;
  }
  const grouped = rules ? rowsOf(rules, lastChanges(rules, zone)) : null;
  const total = grouped ? grouped.period.length + grouped.block.length + grouped.limit.length : 0;
  const here = (extra: Record<string, string | undefined> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ class: rules?.class.id, kind, ...extra })) if (v) p.set(k, v);
    return `/timetable/rules?${p}`;
  };
  const table = (id: string, heading: string, rows: Row[], empty: string) => (
    <section className="tt-block" aria-labelledby={`h-${id}`} data-rules={id}>
      <h2 id={`h-${id}`} className="tt-h">{heading} <span className="tt-count">{rows.length}</span></h2>
      {rows.length === 0 ? (
        <p className="tt-empty">{empty}</p>
      ) : (
        <DataTable
          label={heading}
          columns={[
            { key: "rule", label: "Rule", value: (r: Row) => r.name },
            { key: "grade", label: "Grade", value: () => rules!.class.grade, width: "6rem" },
            { key: "value", label: "Value", value: (r: Row) => r.value },
            { key: "by", label: "Changed by, when", value: (r: Row) => r.by },
            { key: "edit", label: "Edit", value: () => "Edit", width: "6rem", cell: (r: Row) => <Link href={`${here({ edit: r.id })}#row-${r.id}`} className="btn secondary">Edit</Link> },
          ] satisfies Column<Row>[]}
          rows={rows}
          rowKey={(r) => r.id}
          limit={rows.length}
          more={{ page: 1, href: () => "#" }}
          extras={{ attrs: (r) => ({ id: `row-${r.id}`, "data-rule": r.rule }), expand: (r) => (q.edit === r.id ? <EditRow row={r} rules={rules!} back={here()} /> : null) }}
        />
      )}
    </section>
  );
  return (
    <Screen
      stage={rules ? `${rules.class.grade} ${rules.class.section} · ${total} rules` : "Timetable"}
      title="Timetable rules"
      purpose="Period times, blocked days, fixed slots and subject limits, kept as rows with who changed them."
      action={<a href="#add" className="btn" data-ux="action">Add a rule</a>}
      next={{ href: "/timetable/draft", label: "Draft from the rules" }}
      rail={
        <div className="tt-rail">
          <TimetableRail here="rules" coordinator />
          {grouped ? (
            <aside aria-label="This class" data-rail-part="counts" className="tt-rail-card">
              <h2 className="tt-rail-h">{rules!.class.grade} {rules!.class.section}</h2>
              <KeyValue rows={[{ label: "Period times", value: String(rules!.periods.length), num: true }, { label: "Fixed slots", value: String(rules!.fixed.length), num: true }, { label: "Blocked days", value: String(grouped.block.length), num: true }, { label: "Limits", value: String(grouped.limit.length), num: true }]} />
            </aside>
          ) : null}
        </div>
      }
    >
      <div className="tt">
        {down ? <p className="tt-chip late" role="alert">{down}</p> : null}
        {q.error ? <p className="tt-chip late" role="alert">{q.error}</p> : null}
        {q.saved ? <p className="tt-chip done" role="status">Saved.</p> : null}
        {rules === null || grouped === null ? (
          !down && <p className="tt-empty">No class has a timetable yet. Rules appear here once the school&apos;s timetable is loaded.</p>
        ) : (
          <>
            <FilterBar
              action="/timetable/rules"
              filters={[
                { name: "class", label: "Grade", value: rules.class.id, required: true, all: "", options: rules.classes.map((c) => [c.id, `${c.grade} ${c.section}`] as const) },
                { name: "kind", label: "Kind", value: kind, all: "Every kind", options: [["period", "Period times and fixed slots"], ["block", "Blocked days"], ["limit", "Subject limits"]] as const },
              ]}
            />
            <p className="tt-note">Edit opens the row’s fields with Save and Cancel; Save keeps who changed it and when, in the history below.</p>
            {!kind || kind === "period" || kind === "fixed" ? table("period", "Period times and fixed slots", grouped.period, "No period times yet.") : null}
            {!kind || kind === "block" ? table("block", "Blocked days", grouped.block, "Nothing is blocked. Block a day when school is off, or a period that must stay free.") : null}
            {!kind || kind === "limit" ? table("limit", "Subject limits", grouped.limit, "No limits yet. Set the most periods of a subject, the fewest, or both.") : null}
            <AddRule rules={rules} />
            <section className="tt-block" aria-labelledby="h-hist">
              <Details summary={<span id="h-hist">History of edits</span>} id="history" open>
                {rules.history.length === 0 ? (
                  <p className="tt-empty">No rule has been changed yet.</p>
                ) : (
                  <ul className="tt-list">
                    {rules.history.map((e) => (
                      <li key={e.id} data-edit><span className="tt-note">{when(e.at, zone)}</span><span className="grow">{said(e)}</span></li>
                    ))}
                  </ul>
                )}
              </Details>
            </section>
          </>
        )}
      </div>
    </Screen>
  );
}
