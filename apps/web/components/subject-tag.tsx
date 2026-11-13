import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Look } from "@/lib/subject-looks";
import { wholePercents } from "@/lib/whole-percents";

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

/** How a count splits by subject: one bar, each part its subject's colour and length, and a key beside the subjects' words: whole counts,
 *  or with `percent` each part's whole percent of the total (they add up to 100). Parts are told apart by their words, so two subjects
 *  that wear one colour are still two parts. The timetable's right panel uses it, in percent, when nothing is chosen (page charter B2). */
export function SubjectMix({ label, parts, percent }: { label: string; parts: readonly { look: Look; words: string; n: number }[]; percent?: boolean }) {
  const shown = parts.filter((p) => p.n > 0);
  if (!shown.length) return null;
  const pc = wholePercents(shown.map((p) => p.n));
  const say = (i: number) => (percent ? `${pc[i]}%` : String(shown[i].n));
  const said = shown.map((p, i) => `${say(i)} ${p.words}`).join(", ");
  return (
    <section data-block="SubjectMix" aria-label={label} className="b-stack">
      <h3 className="b-label b-muted">{label}</h3>
      <div className="b-sbar" role="img" aria-label={said}>
        {shown.map((p) => (
          <i key={p.words} data-subject={p.look} style={{ "--n": p.n } as React.CSSProperties} />
        ))}
      </div>
      <div className="b-keyrow">
        {shown.map((p, i) => (
          <span key={p.words} className="inline-flex items-center gap-[var(--space-1)]" data-subject-share={p.words}>
            <SubjectTag look={p.look} words={p.words} />
            <span className="b-num b-label">{say(i)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
