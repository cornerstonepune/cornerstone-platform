"use client";

import { useContext } from "react";
import { ClassGrid, type GridCell } from "@/components/class-grid";
import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";
import { initialsOf, type Cluster, type PictureLook } from "@/lib/children-view";
import { PeekChip, PeekContext, type Chosen } from "./peek";

const LOOK: Record<PictureLook, { look: GridCell["look"]; icon: IconName; words: string }> = {
  secure: { look: "ok", icon: "tree", words: "secure" },
  practising: { look: "wait", icon: "leaf", words: "practising" },
  emerging: { look: "quiet", icon: "sprout", words: "emerging" },
  unseen: { look: "unseen", icon: "not-seen", words: "not seen yet" },
};
export const GROUP_ICON: Record<PictureLook, IconName> = { secure: "tree", practising: "leaf", emerging: "sprout", unseen: "not-seen" };

export type Square = Chosen & { look: PictureLook; skill: string };
export type Block = { look: PictureLook; words: string; squares: Square[] };

/** Squares by Sr. No., 8 to a row at 1440 and 3 on a phone, under a heading and a count per group when grouped. A tap opens the
 *  peek; a child not seen on the skill is a dashed square titled "not seen yet", never "not secure". */
export function PictureGrid({ blocks, grouped, label }: { blocks: readonly Block[]; grouped: boolean; label: string }) {
  const { open } = useContext(PeekContext);
  return (
    <div className={grouped ? "b-groups" : undefined}>
      {blocks.map((b) => {
        const cells: GridCell[] = b.squares.map((s) => ({
          key: s.roll,
          no: s.roll,
          initials: initialsOf(s.name),
          name: s.name,
          ...LOOK[s.look],
          // no aria-label: the name a screen reader says is the square's own text (number, name, state), which is what axe holds it to
          attrs: { "data-peek-open": s.roll, "data-roll": s.roll, title: s.look === "unseen" ? "not seen yet" : LOOK[s.look].words },
        }));
        return (
          <section key={b.look} className="b-grp" aria-label={`${b.words}, ${b.squares.length}`} data-group={b.look}>
            {grouped ? (
              <h3 className="b-grp-h" data-state={LOOK[b.look].look}>
                <Icon name={GROUP_ICON[b.look]} size={ICON_SIZE.table} />
                {b.words} <span className="b-count" data-count={b.look}>{b.squares.length}</span>
              </h3>
            ) : null}
            <ClassGrid cells={cells} label={`${label}, by Sr. No.`} onTap={(roll) => open(b.squares.find((s) => s.roll === roll)!)} />
          </section>
        );
      })}
    </div>
  );
}

/** Clusters: who shares a place on this skill, each with its count and its children as chips that open the peek. */
export function Clusters({ clusters, kids }: { clusters: readonly Cluster[]; kids: Record<string, Chosen> }) {
  return (
    <div data-block="Cards" className="b-cards">
      {clusters.map((c) => (
        <article key={c.key} className="b-card" data-cluster={c.key}>
          <div className="b-card-h">
            {c.words} <span className="b-count" data-count={`cluster-${c.key}`}>{c.ids.length}</span>
          </div>
          <div className="b-card-b">
            {c.ids.length === 0 ? (
              <span className="b-muted">Nobody yet</span>
            ) : (
              <ul className="b-nchips" aria-label={c.words}>
                {c.ids.map((id) => (
                  <li key={id}>
                    <PeekChip child={kids[id]} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
