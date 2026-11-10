import { Details } from "./details";
import { KindTile, type Kind } from "./kind-tile";

export type Seen = { kind: Kind; title: string; line: string; when: string; more?: string };

/** What was seen, newest last; words beside the mark; a details fold each where there is more. */
export function Timeline({ entries }: { entries: readonly Seen[] }) {
  return (
    <ol data-block="Timeline" className="b-timeline">
      {entries.map((e) => (
        <li key={e.when + e.title} className="b-tli">
          <KindTile kind={e.kind} />
          <div>
            <b>{e.title}</b>
            <p>{e.line}</p>
            {e.more ? <Details summary="What it said">{e.more}</Details> : null}
          </div>
          <span className="b-caption">{e.when}</span>
        </li>
      ))}
    </ol>
  );
}
