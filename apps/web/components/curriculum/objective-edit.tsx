import { changeObjectiveGrade, saveObjective } from "@/app/(app)/setup/curriculum/actions";
import type { ObjectivePage } from "@/lib/teaching";

// An objective edited where it is shown (CP-70, specs/CP-70/spec.md): its title, subject and unit, and the grades it sits in. Only a
// coordinator is shown this (the engine checks again). An objective can sit in several grades; it stays one objective, shown under each,
// and one grade always stays, so the last one has no Remove. What is saved is live at once and is a person's: a reload leaves it.
type Named = { code: string; name: string };

export function ObjectiveEdit({ lo, subjects, grades, back }: { lo: ObjectivePage; subjects: Named[]; grades: Named[]; back: string }) {
  const name = (code: string) => grades.find((g) => g.code === code)?.name ?? code;
  const addable = grades.filter((g) => !lo.grades.includes(g.code));
  return (
    <div className="grid gap-[var(--space-4)]" data-objective-edit>
      <form action={saveObjective} className="b-form" aria-label="Words of the objective">
        <input type="hidden" name="code" value={lo.code} />
        <input type="hidden" name="back" value={back} />
        <div className="b-field">
          <label htmlFor="oe-title">Objective</label>
          <input id="oe-title" name="title" defaultValue={lo.title} required />
        </div>
        <div className="b-field">
          <label htmlFor="oe-subject">Subject</label>
          <select id="oe-subject" name="subject" defaultValue={lo.subjectCode ?? ""}>
            {lo.subjectCode ? null : <option value="">No subject yet</option>}
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="b-field">
          <label htmlFor="oe-unit">Unit</label>
          <input id="oe-unit" name="unit" defaultValue={lo.unit} />
        </div>
        <div>
          <button type="submit" className="b-btn b-btn-main" data-press>
            Save
          </button>
        </div>
      </form>
      <section aria-label="Grades" className="grid gap-[var(--space-2)]" data-grades>
        <h3 className="font-semibold">Grades</h3>
        <ul className="grid gap-[var(--space-1)]">
          {lo.grades.map((g, i) => (
            <li key={g} data-grade={g} className="flex min-h-[var(--tap)] items-center gap-[var(--space-2)]">
              <span className="min-w-0 flex-1">
                {name(g)}
                {i === 0 ? <span className="b-muted"> · home grade</span> : null}
              </span>
              {lo.grades.length > 1 ? (
                <form action={changeObjectiveGrade}>
                  <input type="hidden" name="code" value={lo.code} />
                  <input type="hidden" name="grade" value={g} />
                  <input type="hidden" name="do" value="remove" />
                  <input type="hidden" name="back" value={back} />
                  <button type="submit" className="b-btn b-btn-text" data-press aria-label={`Take out of ${name(g)}`}>
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {addable.length ? (
          <form action={changeObjectiveGrade} className="flex flex-wrap items-end gap-[var(--space-2)]" aria-label="Add a grade">
            <input type="hidden" name="code" value={lo.code} />
            <input type="hidden" name="do" value="add" />
            <input type="hidden" name="back" value={back} />
            <div className="b-field">
              <label htmlFor="oe-add">Also in</label>
              <select id="oe-add" name="grade" defaultValue={addable[0].code}>
                {addable.map((g) => (
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
        {lo.grades.length === 1 ? <p className="b-muted">An objective stays in at least one grade.</p> : null}
      </section>
    </div>
  );
}
