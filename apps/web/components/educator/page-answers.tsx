import { edit } from "@/app/(app)/setup/activities/[code]/actions";
import { Icon } from "@/lib/icons";
import type { PagePart } from "@/lib/page-part";
import { E } from "@/lib/educator/words";

// Editing a part the machine made, in place (CP-48: no queue, anyone edits directly): the steps one a line; how to think as an idea
// and slips; any other part as text. Saving makes the part a person's, and a reload from the sheet never writes over it. The engine
// changes only a part the machine made (M1-12b's routes); the school's own words never get this.
const W = E.page;
const BTN = "inline-flex min-h-[var(--tap)] items-center gap-[var(--space-1)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-3)] text-[length:var(--text-label)] font-medium text-[var(--ink)]";
const FIELD = "w-full rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] p-[var(--space-2)] text-[length:var(--text-body)]";

/** `back`: the address drawn again once the words are saved (the workspace with this activity open, or its own page). */
export function Answers({ code, p, back }: { code: string; p: PagePart; back: string }) {
  return (
    <details className="mt-[var(--space-2)] grid gap-[var(--space-2)]" data-answers>
      <summary className={`${BTN} w-fit cursor-pointer list-none`}>
        <Icon name="correct" size={16} />
        {W.edit}
      </summary>
      <form action={edit} className="mt-[var(--space-2)] grid gap-[var(--space-2)]">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="part" value={p.part} />
        <input type="hidden" name="kind" value={p.kind} />
        <input type="hidden" name="back" value={back} />
        {p.kind === "bullets" ? (
          <label className="grid gap-[var(--space-1)]">
            <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{W.itemsHint}</span>
            <textarea name="items" rows={Math.max(4, p.items.length + 1)} defaultValue={p.items.join("\n")} className={FIELD} />
          </label>
        ) : p.kind === "thinking" ? (
          <>
            <label className="grid gap-[var(--space-1)]">
              <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{W.idea}</span>
              <input name="idea" defaultValue={p.idea ?? ""} className={FIELD} />
            </label>
            <label className="grid gap-[var(--space-1)]">
              <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{W.slipsHint}</span>
              <textarea name="slips" rows={4} defaultValue={p.slips.map((s) => `${s.keyword}: ${s.spot}`).join("\n")} className={FIELD} />
            </label>
          </>
        ) : (
          <label className="grid gap-[var(--space-1)]">
            <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{W.words}</span>
            <textarea name="text" rows={4} defaultValue={p.text} className={FIELD} />
          </label>
        )}
        <button type="submit" aria-label={W.save} className={`${BTN} w-fit`}>
          {W.save}
        </button>
      </form>
    </details>
  );
}
