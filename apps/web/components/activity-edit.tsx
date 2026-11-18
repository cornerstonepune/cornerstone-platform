import { changeGrade, changeTie, rename, undo } from "@/app/(app)/setup/activities/[code]/actions";
import type { ActivityEdit, Choice } from "@/lib/activity-edit";
import { Icon } from "@/lib/icons";

// An activity edited where it is shown (CP-70, specs/CP-70/spec.md): its name, the grades it is tagged to, the objectives and skills it is
// tied to, and what was changed on it with one step of Undo. Only a coordinator is given these (the engine checks again on every write);
// everyone else reads the same page with none of them. Each form says where on the page to come back to (`at`, a card's id).
type Where = { code: string; back: string };

function Hidden({ w, at, more }: { w: Where; at: string; more?: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="code" value={w.code} />
      <input type="hidden" name="back" value={w.back} />
      <input type="hidden" name="at" value={at} />
      {Object.entries(more ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/** The name, saved on its own. */
export function NameEdit({ w, name }: { w: Where; name: string }) {
  return (
    <form action={rename} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[var(--space-2)]" aria-label="Name of the activity" data-name-edit>
      <Hidden w={w} at="where" />
      <div className="b-field">
        <label htmlFor="ae-name">Name</label>
        <input id="ae-name" name="name" defaultValue={name} required className="w-full min-w-0" />
      </div>
      <button type="submit" className="b-btn" data-press>
        Save name
      </button>
    </form>
  );
}

/** The grades it is tagged to: the first is its own; one always stays, so a lone grade has no Remove. */
export function GradesEdit({ w, edit }: { w: Where; edit: ActivityEdit }) {
  return (
    <section aria-label="Grades" className="grid gap-[var(--space-2)]" data-grades>
      <h3 className="font-semibold">Grades</h3>
      <ul className="grid gap-[var(--space-1)]">
        {edit.grades.map((g, i) => (
          <li key={g.code} data-grade={g.code} className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)]">
            <span className="min-w-0 flex-1">
              {g.name}
              {i === 0 && edit.grades.length > 1 ? <span className="b-muted"> · its own grade</span> : null}
            </span>
            {edit.grades.length > 1 ? (
              <form action={changeGrade}>
                <Hidden w={w} at="where" more={{ grade: g.code, do: "remove" }} />
                <button type="submit" className="b-btn b-btn-text" data-press aria-label={`Take out of ${g.name}`}>
                  Remove
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {edit.addable.length ? (
        <form action={changeGrade} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[var(--space-2)]" aria-label="Add a grade">
          <Hidden w={w} at="where" more={{ do: "add" }} />
          <div className="b-field">
            <label htmlFor="ae-grade">Also show it in</label>
            <select id="ae-grade" name="grade" defaultValue={edit.addable[0].code} className="w-full min-w-0">
              {edit.addable.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="b-btn" data-press>
            Add grade
          </button>
        </form>
      ) : null}
      {edit.grades.length === 1 ? <p className="b-muted">An activity stays in at least one grade.</p> : null}
    </section>
  );
}

/** At the end of a tied row: untie it. The objective or skill itself stays; only the tie goes. */
export function Untie({ w, kind, other, name }: { w: Where; kind: "objective" | "skill"; other: string; name: string }) {
  return (
    <form action={changeTie}>
      <Hidden w={w} at="learns" more={{ kind, other, do: "remove" }} />
      <button type="submit" className="b-btn b-btn-text" data-press data-untie={kind} aria-label={`Untie ${name}`}>
        Untie
      </button>
    </form>
  );
}

/** Under a list of ties: one more, picked from what the school already has, under the heading it sits under. */
export function TieAdd({ w, kind, choices, none }: { w: Where; kind: "objective" | "skill"; choices: Choice[]; none: string }) {
  if (!choices.length) return <p className="b-muted">{none}</p>;
  const groups = [...new Set(choices.map((c) => c.group))];
  const id = `ae-tie-${kind}`;
  return (
    <form action={changeTie} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-[var(--space-2)]" aria-label={`Tie ${kind === "skill" ? "a skill" : "an objective"}`} data-tie-add={kind}>
      <Hidden w={w} at="learns" more={{ kind, do: "add" }} />
      <div className="b-field">
        <label htmlFor={id}>{kind === "skill" ? "Tie another skill" : "Tie another objective"}</label>
        <select id={id} name="other" required defaultValue="" className="w-full min-w-0">
          <option value="" disabled>
            Choose {kind === "skill" ? "a skill" : "an objective"}
          </option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {choices
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <button type="submit" className="b-btn" data-press>
        Tie
      </button>
    </form>
  );
}

/** What was changed, newest first, in plain words: what, from and to, who and when; Undo on a change nothing later touched. */
export function Changes({ w, edit }: { w: Where; edit: ActivityEdit }) {
  if (!edit.changes.length) return <p className="b-muted" data-empty>Nothing has been changed yet.</p>;
  return (
    <>
      <ol className="b-timeline" data-changes>
        {edit.changes.map((c) => (
          <li key={c.id} className="b-tli" data-change={c.what}>
            <span className="grid h-[var(--tap)] place-items-center text-[var(--ink-muted)]">
              <Icon name="history" size={16} />
            </span>
            <div className="min-w-0 self-center [overflow-wrap:anywhere]">
              <b>{c.what}</b>
              {c.from || c.to ? (
                <span data-change-words>
                  {": "}
                  {c.from ? <s className="b-muted">{c.from}</s> : null}
                  {c.from && c.to ? " → " : null}
                  {c.to}
                </span>
              ) : null}
              <p className="b-label">
                {c.who} · {c.when}
              </p>
            </div>
            {c.undo ? (
              <form action={undo}>
                <Hidden w={w} at="changes" more={{ change: c.id }} />
                <button type="submit" className="b-btn" data-press aria-label={`Undo: ${c.what}`}>
                  Undo
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ol>
      {edit.earlier ? <p className="b-muted">And {edit.earlier} earlier {edit.earlier === 1 ? "change" : "changes"}.</p> : null}
    </>
  );
}
