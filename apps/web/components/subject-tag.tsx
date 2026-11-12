import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Look } from "@/lib/subject-looks";

/** A subject on any block (docs/frontend/page-charter.md A3): its icon, its word and its colour, never the colour alone. The colour is the
 *  subject row's look (lib/subject-looks.ts, the school's own config), the word the subject's own label; nothing here names a subject. */
export function SubjectTag({ look, words }: { look: Look; words: string }) {
  return (
    <span data-block="SubjectTag" data-subject={look} className="b-subj">
      <Icon name={look} size={ICON_SIZE.table} />
      {words}
    </span>
  );
}

/** How a count splits by subject: one bar, each part its subject's colour and length, and a key of whole counts beside the subjects' words
 *  (the right panel's "lessons by subject" when nothing is chosen). */
export function SubjectMix({ label, parts }: { label: string; parts: readonly { look: Look; words: string; n: number }[] }) {
  const shown = parts.filter((p) => p.n > 0);
  if (!shown.length) return null;
  const said = shown.map((p) => `${p.n} ${p.words}`).join(", ");
  return (
    <section data-block="SubjectMix" aria-label={label} className="b-stack">
      <h3 className="b-label b-muted">{label}</h3>
      <div className="b-sbar" role="img" aria-label={said}>
        {shown.map((p) => (
          <i key={p.look} data-subject={p.look} style={{ "--n": p.n } as React.CSSProperties} />
        ))}
      </div>
      <div className="b-keyrow">
        {shown.map((p) => (
          <span key={p.look} className="inline-flex items-center gap-[var(--space-1)]">
            <SubjectTag look={p.look} words={p.words} />
            <span className="b-num b-label">{p.n}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
