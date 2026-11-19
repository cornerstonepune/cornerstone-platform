import Link from "@/components/link";
import { changeTie, saveLevels, setMaterials } from "@/app/(app)/setup/activities/[code]/actions";
import { LEVELS, part } from "./blocks";
import type { Choice } from "@/lib/activity-edit";
import type { ActivityPage } from "@/lib/teaching";

// The activity page's forms, one a section: each opens in place of its section's words when that section's Edit is pressed, and goes
// back to the words once saved. Nothing here is a second way to say what a section says: the words come from ./blocks.
const FIELD = "w-full rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] p-[var(--space-2)] text-[length:var(--text-body)]";
const LABEL = "text-[length:var(--text-label)] text-[var(--ink-muted)]";

/** Save and Cancel under any of the forms. */
export function Foot({ save, cancel }: { save: string; cancel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-[var(--space-2)]">
      <button type="submit" className="btn w-fit">{save}</button>
      <Link href={cancel} className="btn secondary w-fit" scroll={false}>Cancel</Link>
    </div>
  );
}

export function MaterialsForm({ page, back, cancel }: { page: ActivityPage; back: string; cancel: string }) {
  const rows = [...page.materials.items.map((m) => ({ name: m.name, count: m.quantity })), { name: "", count: null }, { name: "", count: null }];
  return (
    <form action={setMaterials} className="grid gap-[var(--space-2)]" data-materials-edit>
      <input type="hidden" name="code" value={page.code} />
      <input type="hidden" name="back" value={back} />
      {rows.map((m, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-[var(--space-2)]">
          <label className="grid gap-[var(--space-1)]">
            <span className={LABEL}>Material {i + 1}</span>
            <input name="name" defaultValue={m.name} className={FIELD} />
          </label>
          <label className="grid gap-[var(--space-1)]">
            <span className={LABEL}>How many</span>
            <input name="count" type="number" min={1} step="any" defaultValue={m.count ?? ""} className={FIELD} />
          </label>
        </div>
      ))}
      <p className={LABEL}>Clear a name to take that material out.</p>
      <Foot save="Save the materials" cancel={cancel} />
    </form>
  );
}

export function MarkForm({ page, back, cancel }: { page: ActivityPage; back: string; cancel: string }) {
  return (
    <form action={saveLevels} className="grid gap-[var(--space-2)]" data-levels-edit>
      <input type="hidden" name="code" value={page.code} />
      <input type="hidden" name="back" value={back} />
      {LEVELS.map((k, n) => {
        const was = part(page, k)?.text ?? "";
        return (
          <label key={k} className="grid gap-[var(--space-1)]">
            <span className={LABEL}>Level {n}</span>
            <input type="hidden" name={`was_${n}`} value={was} />
            <textarea name={`level_${n}`} rows={2} defaultValue={was} className={FIELD} />
          </label>
        );
      })}
      <Foot save="Save the levels" cancel={cancel} />
    </form>
  );
}

type Where = { code: string; back: string };

/** One link, taken away; the objective or skill itself stays. */
export function RemoveLink({ w, kind, other, name }: { w: Where; kind: "objective" | "skill"; other: string; name: string }) {
  return (
    <form action={changeTie}>
      <input type="hidden" name="code" value={w.code} />
      <input type="hidden" name="back" value={w.back} />
      <input type="hidden" name="at" value="connects" />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="other" value={other} />
      <input type="hidden" name="do" value="remove" />
      <button type="submit" className="btn secondary" data-untie={kind} aria-label={`Remove link to ${name}`}>Remove link</button>
    </form>
  );
}

const SHOWN = 6;

/** Add a link: a box that finds among the objectives and skills of this grade and subject (a GET, so it works without script), and each
 *  find a button. `choices` come already narrowed to the grade and subject. */
export function AddLink({ w, kind, choices, find, action }: { w: Where; kind: "objective" | "skill"; choices: Choice[]; find: string; action: string }) {
  const word = kind === "skill" ? "skill" : "objective";
  const [path, query = ""] = action.split("?");
  const hits = choices.filter((c) => !find || c.name.toLowerCase().includes(find.toLowerCase()));
  return (
    <section className="grid gap-[var(--space-2)]" aria-label={`Add a ${word}`} data-tie-add={kind}>
      <form action={path} method="get" role="search" className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[var(--space-2)]">
        {[...new URLSearchParams(query)].map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="edit" value="connects" />
        <input type="hidden" name="kind" value={kind} />
        <div className="b-field">
          <label htmlFor={`find-${kind}`}>Add a {word} of this grade and subject</label>
          <input id={`find-${kind}`} name="find" type="search" defaultValue={find} placeholder={`Find a ${word}`} className="w-full min-w-0" />
        </div>
        <button type="submit" className="btn secondary">Find</button>
      </form>
      {hits.length ? (
        <ul className="grid gap-[var(--space-1)]">
          {hits.slice(0, SHOWN).map((c) => (
            <li key={c.code} className="flex items-center gap-[var(--space-2)]" data-choice={c.code}>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.name}</span>
              <form action={changeTie}>
                <input type="hidden" name="code" value={w.code} />
                <input type="hidden" name="back" value={w.back} />
                <input type="hidden" name="at" value="connects" />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="other" value={c.code} />
                <input type="hidden" name="do" value="add" />
                <button type="submit" className="btn secondary" aria-label={`Link ${c.name}`}>Link</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--ink-muted)]">{find ? `No ${word} of this grade and subject matches.` : `Every ${word} of this grade and subject is linked already.`}</p>
      )}
      {hits.length > SHOWN ? <p className={LABEL}>{hits.length - SHOWN} more: type to narrow.</p> : null}
    </section>
  );
}

