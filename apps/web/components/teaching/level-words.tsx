import { changeWords } from "@/app/(app)/setup/skills/[code]/actions";
import { Icon } from "@/lib/icons";

// One level's sentence on the skill screen, with its history and (for a person who may change it) the form to change it. A change
// withdraws that level's approval, so the form says so; who changed it is a member of staff by name, never a child.
const BTN = "inline-flex min-h-[var(--tap)] items-center gap-[var(--space-1)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-3)] text-[length:var(--text-label)] font-medium";
const FIELD = "w-full rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] p-[var(--space-2)] text-[length:var(--text-body)]";

export type Earlier = { at: string; who: string; was: string | null; now: string | null; reason: string | null };

export function LevelWords({ code, set, level, words, earlier, canChange }: { code: string; set: string; level: string; words: string; earlier: Earlier[]; canChange: boolean }) {
  return (
    <li data-level-words={level}>
      <b>{level}</b> · {words}
      {earlier.length ? (
        <details data-fold="level-history" className="mt-[var(--space-1)]">
          <summary className="cursor-pointer text-[length:var(--text-label)] text-[var(--ink-muted)]">Earlier sentences ({earlier.length})</summary>
          <ol className="grid gap-[var(--space-1)] text-[length:var(--text-label)]">
            {earlier.map((e, i) => (
              <li key={i} data-earlier>
                <span className="b-caption">
                  {e.at} · {e.who}
                  {e.reason ? ` · ${e.reason}` : ""}
                </span>
                <br />
                {e.was ? <s>{e.was}</s> : null} {e.now ? <>→ {e.now}</> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {canChange ? (
        <details className="mt-[var(--space-1)]" data-fold="change-words">
          <summary className={`${BTN} w-fit cursor-pointer list-none`}>
            <Icon name="correct" size={16} />
            Change this sentence
          </summary>
          <form action={changeWords} className="mt-[var(--space-2)] grid gap-[var(--space-2)]">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="set" value={set} />
            <input type="hidden" name="level" value={level} />
            <label className="grid gap-[var(--space-1)]">
              <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">The sentence, up to 400 characters. Saving it takes this level out of approved until someone reads it again.</span>
              <textarea name="words" rows={3} maxLength={400} defaultValue={words} required className={FIELD} />
            </label>
            <label className="grid gap-[var(--space-1)]">
              <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">Why (optional)</span>
              <input name="reason" className={FIELD} />
            </label>
            <button type="submit" className={`${BTN} w-fit`}>
              Save
            </button>
          </form>
        </details>
      ) : null}
    </li>
  );
}
