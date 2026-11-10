"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ChildPeek, NameChip } from "@/components/child-peek";
import { STATES } from "@/components/status-chip";
import type { Entry } from "@/lib/children-peek";
import { initialsOf, peekParam, type Counts } from "@/lib/children-view";

// The child chosen in a table, a grid or a cluster (UI-3b). One provider wraps the screen: any NameChip or square opens the same
// ChildPeek in the rail; the history is fetched when it opens (a POST by class and Sr. No., never a name in an address).
export type Chosen = { classId: string; roll: string; name: string; section: string; counts: Counts };
export const PeekContext = createContext<{ chosen: Chosen | null; open: (c: Chosen) => void; close: () => void }>({ chosen: null, open: () => undefined, close: () => undefined });

/** The address carries the open peek as `peek=<class>:<Sr. No.>`, never a name; a page opened with it shows the peek (`initial`). */
function writeAddress(c: Chosen | null) {
  const u = new URL(window.location.href);
  if (c) u.searchParams.set("peek", peekParam(c));
  else u.searchParams.delete("peek");
  window.history.replaceState(window.history.state, "", u);
}

export function PeekProvider({ initial = null, children }: { initial?: Chosen | null; children: ReactNode }) {
  const [chosen, setChosen] = useState<Chosen | null>(initial);
  const open = useCallback((c: Chosen) => {
    setChosen(c);
    writeAddress(c);
  }, []);
  const close = useCallback(() => {
    setChosen(null);
    writeAddress(null);
  }, []);
  return <PeekContext.Provider value={{ chosen, open, close }}>{children}</PeekContext.Provider>;
}

/** A child as a chip that opens the peek. */
export function PeekChip({ child }: { child: Chosen }) {
  const { open } = useContext(PeekContext);
  return <NameChip no={child.roll} name={child.name} onOpen={() => open(child)} />;
}

/** The peek itself, drawn where the page puts its rail; nothing until a child is chosen. */
export function PeekPanel() {
  const { chosen, close } = useContext(PeekContext);
  const [got, setGot] = useState<{ key: string; entries: Entry[] | null }>({ key: "", entries: null });
  const key = chosen ? `${chosen.classId}/${chosen.roll}` : "";
  useEffect(() => {
    if (!chosen) return;
    let live = true;
    void fetch("/api/children/peek", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ class: chosen.classId, roll: chosen.roll }) })
      .then((r) => (r.ok ? (r.json() as Promise<{ entries: Entry[] }>) : { entries: [] as Entry[] }))
      .then((j) => live && setGot({ key, entries: j.entries }))
      .catch(() => live && setGot({ key, entries: [] }));
    return () => {
      live = false;
    };
  }, [chosen, key]);
  if (!chosen) return null;
  const c = chosen.counts;
  const counts = [
    { state: "secure" as const, words: `${c.secure} ${STATES.secure.words}` },
    { state: "practising" as const, words: `${c.practising} ${STATES.practising.words}` },
    { state: "notSeenYet" as const, words: `${c.unseen} ${STATES.notSeenYet.words}` },
  ];
  const entries = got.key === key ? (got.entries ?? []) : [];
  return (
    <ChildPeek
      key={key}
      child={{ no: chosen.roll, initials: initialsOf(chosen.name), name: chosen.name, className: chosen.section }}
      counts={counts}
      entries={entries.map((e) => ({ kind: e.kind, title: e.title, line: e.line, when: e.when }))}
      openHref={`/children/${encodeURIComponent(chosen.classId)}/${encodeURIComponent(chosen.roll)}`}
      onClose={close}
    />
  );
}
