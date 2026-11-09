"use client";

import { useState } from "react";
import { ClassGrid, type GridCell, type Look } from "@/components/class-grid";
import type { IconName } from "@/lib/icons";

// The ClassGrid on sample children (names from the fake-names list): a tap on a square moves it to the next mark, as a
// mark is tapped on the confirm screen.
const LOOKS: { look: Look; icon: IconName; words: string }[] = [
  { look: "ok", icon: "secure", words: "secure" },
  { look: "wait", icon: "practising", words: "practising" },
  { look: "quiet", icon: "emerging", words: "emerging" },
  { look: "unseen", icon: "not-seen", words: "not seen yet" },
];
export const CHILDREN = ["Alba Ant", "Bea Badger", "Cal Crow", "Dot Deer", "Eli Eel", "Finn Fox", "Gus Goat", "Hazel Hare"] as const;
const initials = (n: string) => n.split(" ").map((w) => w[0]).join("");

export function GridSample({ mode }: { mode: "button" | "link" }) {
  const [at, setAt] = useState<number[]>(CHILDREN.map((_, i) => i % 4));
  const cells: GridCell[] = CHILDREN.map((n, i) => ({ key: String(i), no: String(i + 1).padStart(2, "0"), initials: initials(n), name: n, ...LOOKS[at[i]], href: mode === "link" ? `/setup/blocks?child=${i + 1}` : undefined }));
  return <ClassGrid label={mode === "button" ? "Sample class, tap to mark" : "Sample class, open a child"} cells={cells} onTap={mode === "button" ? (k) => setAt(at.map((v, i) => (i === Number(k) ? (v + 1) % 4 : v))) : undefined} />;
}
