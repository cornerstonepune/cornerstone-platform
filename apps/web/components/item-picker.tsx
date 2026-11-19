"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { StatusChip } from "@/components/status-chip";
import { addItem, findItems } from "@/lib/catalogue-actions";
import { COMMON_UNITS, countOf, fieldOfAdd, groupName, needsFirst, type AddField, type Close, type Found, type Item, type Picked } from "@/lib/catalogue-words";

// The one item picker (CP-84b): wherever a person chooses a material, they search the one list, grouped by category, and pick from it; a name close to an
// item that exists is offered as "Did you mean" and never makes a second; "Not in the list? Add it" asks for name, unit and category (all three) and picks the
// new item at once. No free text ever reaches a list: what the form holds is an item's code, from the engine. The engine's words (a refusal, or what it
// found) are shown as sent, beside the field they name.
const MOST = 30; // items shown at once; typing more narrows the rest
const NONE: { name: string; unit: string; category: string } = { name: "", unit: "", category: "" };
const pick = (i: Item): Picked => ({ code: i.code, name: i.name, unit: i.unit, category: i.category });

export function ItemPicker({ label, value, onPick, exclude = [], name, hint }: { label: string; value: Picked | null; onPick: (item: Picked | null) => void; exclude?: readonly string[]; name?: string; hint?: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState(false); // nothing is read until the person comes to the field
  const [found, setFound] = useState<Found | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(NONE);
  const [refusal, setRefusal] = useState<{ field: AddField | null; words: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const turn = useRef(0);

  useEffect(() => {
    if (!asked) return;
    const mine = ++turn.current;
    const wait = setTimeout(
      () =>
        start(async () => {
          const r = await findItems(q);
          if (mine !== turn.current) return; // a later question has been asked: its answer is the one to show
          setFailed(r.ok ? null : r.error);
          if (r.ok) setFound(r.found);
        }),
      q ? 180 : 0,
    );
    return () => clearTimeout(wait);
  }, [q, asked]);

  const choose = (item: Picked, words?: string) => {
    onPick(item);
    setQ("");
    setAdding(false);
    setSaid(words ?? null);
  };
  const change = () => {
    onPick(null);
    setSaid(null);
  };
  /** A close name is picked at once: its unit is read from the list, which the close names do not carry. */
  const chooseClose = (c: Close) =>
    start(async () => {
      const r = await findItems(c.name);
      const item = r.ok ? r.found.groups.flatMap((g) => g.items).find((i) => i.code === c.code) : undefined;
      if (item) choose(pick(item));
      else setFailed(r.ok ? `${c.name} could not be found just now.` : r.error);
    });
  const openAdd = () => {
    setAdding(true);
    setRefusal(null);
    setForm({ ...NONE, name: q.trim() });
  };
  const add = () =>
    start(async () => {
      const r = await addItem(form);
      if (!r.ok) return setRefusal({ field: fieldOfAdd(r.error), words: r.error });
      setRefusal(null);
      choose(pick(r.item), r.created ? `${r.item.name} is added to the list and picked.` : `${r.item.name} is already in the list, so that is the one picked.`);
    });

  const shown = found ? needsFirst(found.groups).map((g) => ({ ...g, items: g.items.filter((i) => !exclude.includes(i.code)) })).filter((g) => g.items.length) : [];
  const total = countOf(shown);
  const before = (i: number) => shown.slice(0, i).reduce((n, g) => n + g.items.length, 0);
  const cut = shown.map((g, i) => ({ ...g, items: g.items.slice(0, Math.max(0, MOST - before(i))) })).filter((g) => g.items.length);
  const listed = new Set(shown.flatMap((g) => g.items.map((i) => i.code)));
  const close = (found?.close ?? []).filter((c) => !listed.has(c.code) && !exclude.includes(c.code));
  const units = [...new Set([...COMMON_UNITS, ...(found?.groups.flatMap((g) => g.items.map((i) => i.unit)) ?? [])])];
  const bad = (f: AddField) => (refusal?.field === f ? { "aria-invalid": true, "aria-describedby": `${id}-${f}-error` } : {});
  const words = (f: AddField) =>
    refusal?.field === f ? (
      <p id={`${id}-${f}-error`} data-error className="[overflow-wrap:anywhere]">
        {refusal.words}
      </p>
    ) : null;

  return (
    <div data-item-picker className="grid min-w-0 gap-[var(--space-2)]">
      {name ? <input type="hidden" name={name} value={value?.code ?? ""} /> : null}
      {value ? (
        <div className="grid gap-[var(--space-1)]">
          <span className="b-label">{label}</span>
          <div className="flex flex-wrap items-center gap-[var(--space-2)]" data-picked={value.code}>
            <b className="[overflow-wrap:anywhere]">{value.name}</b>
            <span className="b-muted">{value.unit}</span>
            <button type="button" className="btn tertiary" onClick={change}>
              Change item
            </button>
          </div>
        </div>
      ) : (
        <div className="b-field">
          <label htmlFor={id}>{label}</label>
          <input id={id} type="search" aria-controls={`${id}-results`} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setAsked(true)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} placeholder={hint ?? "Type to find an item"} autoComplete="off" />
        </div>
      )}
      {said ? (
        <p role="status" data-picker-said className="font-semibold">
          {said}
        </p>
      ) : null}
      {!value && asked ? (
        <div id={`${id}-results`} className="grid min-w-0 gap-[var(--space-2)]" data-picker-results aria-busy={pending}>
          {failed ? (
            <p role="alert" data-error>
              {failed}
            </p>
          ) : null}
          {found && !total && !failed ? <p className="b-muted" data-picker-none>No item has those words.</p> : null}
          {cut.map((g) => (
            <section key={g.category ?? "needs"} aria-label={groupName(g.category)} data-picker-group={groupName(g.category)} className="grid gap-[var(--space-1)]">
              <h3 className="b-label b-muted flex flex-wrap items-center gap-[var(--space-1)]">
                {g.category === null ? <StatusChip state="toConfirm" words="needs a category" compact /> : g.category}
              </h3>
              <ul className="grid gap-[var(--space-1)]">
                {g.items.map((i) => (
                  <li key={i.code}>
                    <button type="button" data-pick={i.code} onClick={() => choose(pick(i))} className="flex min-h-[var(--tap)] w-full cursor-pointer items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--ground)] px-[var(--space-2)] text-left text-[var(--ink)] hover:bg-[var(--surface)]">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{i.name}</span>
                      <span className="b-muted b-label whitespace-nowrap">{i.unit}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {total > MOST ? (
            <p className="b-muted b-label" data-picker-more>
              Showing the first {MOST} of {total.toLocaleString("en-IN")}. Type more to narrow.
            </p>
          ) : null}
          {close.length ? (
            <section aria-label="Did you mean" data-did-you-mean className="grid gap-[var(--space-1)]">
              <h3 className="b-label">Did you mean</h3>
              <ul className="flex flex-wrap gap-[var(--space-2)]">
                {close.map((c) => (
                  <li key={c.code}>
                    <button type="button" data-close={c.code} className="b-btn" onClick={() => chooseClose(c)}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {found?.can.add ? (
            adding ? (
              // not a <form>: the picker sits inside a form of its own (stock in, the class list), and a form never holds a form
              <div role="group" aria-label="Add it to the list" data-add-item className="b-form" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); add(); } }}>
                <h3 className="b-label">Add it to the list</h3>
                {refusal && !refusal.field ? (
                  <p role="alert" data-error className="text-[var(--state-late)] [overflow-wrap:anywhere]">
                    {refusal.words}
                  </p>
                ) : null}
                <div className="b-field" data-field="name">
                  <label htmlFor={`${id}-name`}>Name</label>
                  <input id={`${id}-name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} autoComplete="off" {...bad("name")} />
                  {words("name")}
                </div>
                <div className="b-field" data-field="unit">
                  <label htmlFor={`${id}-unit`}>Unit</label>
                  <input id={`${id}-unit`} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} list={`${id}-units`} maxLength={30} autoComplete="off" placeholder="piece, box, sheet" {...bad("unit")} />
                  <datalist id={`${id}-units`}>
                    {units.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                  {words("unit")}
                </div>
                <div className="b-field" data-field="category">
                  <label htmlFor={`${id}-category`}>Category</label>
                  <select id={`${id}-category`} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} {...bad("category")}>
                    <option value="">Choose a category</option>
                    {found.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {words("category")}
                </div>
                <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                  <button type="button" className="btn secondary" data-add-save onClick={add} disabled={pending} aria-busy={pending}>
                    {pending ? "Adding…" : "Add to the list"}
                  </button>
                  <button type="button" className="btn tertiary" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button type="button" className="btn tertiary" data-add-open onClick={openAdd}>
                  Not in the list? Add it
                </button>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
