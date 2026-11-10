"use client";

import { createContext, useContext, useState } from "react";
import { ChildPeek, NameChip, type Peeked } from "./child-peek";

// The children a screen names, as chips that open ChildPeek (SPEC §5): the address carries the Sr. No. (`?peek=03`, never a
// name), Close or Escape closes it and focus returns to the chip. The history under the child (notes, observations, papers,
// state changes) has no read behind it yet (issue #565 asks for one); until then the panel shows the child and the way on.
export type PeekKid = Peeked & { href: string };
const Ctx = createContext<(k: PeekKid) => void>(() => undefined);

export function PeekHost({ children }: { children: React.ReactNode }) {
  const [kid, setKid] = useState<PeekKid | null>(null);
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
      {kid ? <ChildPeek child={kid} counts={[]} entries={[]} openHref={kid.href} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

/** A child as a chip inside a PeekHost. */
export function PeekChip({ kid }: { kid: PeekKid }) {
  const open = useContext(Ctx);
  return <NameChip no={kid.no} name={kid.name} onOpen={() => open(kid)} />;
}
