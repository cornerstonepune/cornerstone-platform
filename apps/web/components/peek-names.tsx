"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { peekHistory } from "@/app/(app)/notes/peek";
import { ChildPeek, NameChip, type Peeked } from "./child-peek";
import type { Seen } from "./timeline";

// The children a screen names, as chips that open ChildPeek (SPEC §5): the address carries the Sr. No. (`?peek=03`, never a
// name), Close or Escape closes it and focus returns to the chip. The history under the child is read when it opens
// (POST /k2/child-history through the `peekHistory` action): observations, evidence and papers, newest first, each with who and
// when. A note shows no words here and the engine keeps no "state changed" entry, so the evidence that moved a state is shown.
export type PeekKid = Peeked & { href: string; classId: string; roll: string };
const Ctx = createContext<(k: PeekKid) => void>(() => undefined);

export function PeekHost({ children }: { children: React.ReactNode }) {
  const [kid, setKid] = useState<PeekKid | null>(null);
  const [read, setRead] = useState<{ no: string; entries: Seen[] } | null>(null);
  const entries = kid && read?.no === kid.no ? read.entries : [];
  useEffect(() => {
    if (!kid) return;
    let live = true;
    peekHistory(kid.classId, kid.roll).then((got) => live && setRead({ no: kid.no, entries: got })).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kid]);
  const open = (k: PeekKid) => {
    setKid(k);
    const u = new URL(window.location.href);
    u.searchParams.set("peek", k.no);
    window.history.replaceState(null, "", u);
  };
  const close = () => {
    setKid(null);
    const u = new URL(window.location.href);
    u.searchParams.delete("peek");
    window.history.replaceState(null, "", u);
  };
  return (
    <Ctx.Provider value={open}>
      {children}
      {kid ? <ChildPeek child={kid} counts={[]} entries={entries} openHref={kid.href} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

/** A child as a chip inside a PeekHost. */
export function PeekChip({ kid }: { kid: PeekKid }) {
  const open = useContext(Ctx);
  return <NameChip no={kid.no} name={kid.name} onOpen={() => open(kid)} />;
}
