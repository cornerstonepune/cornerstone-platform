"use client";

import { useState } from "react";
import { ChildPeek, NameChip, type Peeked, type PeekCount } from "@/components/child-peek";
import { PRACTISING, SECURE, STATES } from "@/components/status-chip";
import type { Seen } from "@/components/timeline";

// Sample children (fake names, docs/frontend/wireframes/fake-names.json): the peek opens for the one chosen, the address
// carries its Sr. No. (`?peek=01`, never a name), Close or Escape closes it and focus returns to the chip that opened it.
const KIDS: readonly Peeked[] = [
  { no: "01", initials: "AA", name: "Alba Ant", className: "K2 Red" },
  { no: "02", initials: "BB", name: "Bea Badger", className: "K2 Red" },
];
const COUNTS: readonly PeekCount[] = [
  { state: SECURE, words: `6 ${STATES[SECURE].words}` },
  { state: PRACTISING, words: `3 ${STATES[PRACTISING].words}` },
  { state: "notSeenYet", words: "2 not seen yet" },
];
const SEEN: readonly Seen[] = [
  { kind: "skill", title: "Counting in tens: now secure", line: "The state changed after a third day seen", when: "20-Nov" },
  { kind: "assessment", title: "Paper, sheet 3", line: "4 right, 1 wrong with working, 1 blank · signed off by Bina Basil", when: "20-Nov" },
  { kind: "note", title: "Counts on from 30 in tens, with bundles", line: "Voice note · confirmed by Asha Almond", when: "18-Nov" },
  { kind: "activity", title: "Counting in tens with bundles: as expected", line: "Observed in the period · Asha Almond", when: "18-Nov" },
  { kind: "period", title: "A mark corrected: below became as expected", line: "A new entry that replaces the first · Asha Almond", when: "18-Nov" },
];

function keepInAddress(no: string | null) {
  const u = new URL(window.location.href);
  if (no) u.searchParams.set("peek", no);
  else u.searchParams.delete("peek");
  window.history.replaceState(null, "", u);
}

export function PeekSample({ first }: { first?: string }) {
  const [no, setNo] = useState<string | null>(first && KIDS.some((k) => k.no === first) ? first : KIDS[0].no);
  const kid = KIDS.find((k) => k.no === no);
  const set = (n: string | null) => {
    setNo(n);
    keepInAddress(n);
  };
  return (
    <div className="b-sample">
      <ul className="b-nchips" aria-label="Children">
        {KIDS.map((k) => (
          <li key={k.no}>
            <NameChip no={k.no} name={k.name} onOpen={() => set(k.no)} />
          </li>
        ))}
      </ul>
      {kid ? <ChildPeek key={kid.no} child={kid} counts={COUNTS} entries={SEEN} openHref="/setup/blocks?open=ChildPeek" onClose={() => set(null)} /> : null}
    </div>
  );
}
