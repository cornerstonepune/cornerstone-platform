"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";

// Editing a part in the person's own words (CP-48: no queue; CP-53: any part, the school's words included). The engine records the part
// as the person's, so a reload from the sheet never writes over it.
// The page the edit was made on is drawn again: the curriculum workspace with the activity open, or the activity's own page.
const OURS = /^\/setup\/(curriculum|activities\/)\S*$/;

/** Her own words: the steps one a line; how to think as an idea line and slips, each "keyword: how to see it". */
export async function edit(f: FormData): Promise<void> {
  const me = await requireStaff();
  const code = String(f.get("code") ?? "");
  const part = String(f.get("part") ?? "");
  const lines = (k: string) => String(f.get(k) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const kind = String(f.get("kind") ?? "text");
  const words =
    kind === "bullets"
      ? { items: lines("items") }
      : kind === "thinking"
        ? {
            idea: String(f.get("idea") ?? "").trim(),
            slips: lines("slips").map((l) => {
              const cut = l.indexOf(":");
              return cut > 0 ? { keyword: l.slice(0, cut).trim(), spot: l.slice(cut + 1).trim() } : { keyword: l, spot: "" };
            }),
          }
        : { text: String(f.get("text") ?? "").trim() };
  const res = await engineSend("/curriculum/page/edit", { actor: me.email, code, part, ...words } as never);
  if (!res.ok && res.status !== 409) throw new EngineDown(`The engine refused that (${res.status}).`);
  revalidatePath(`/setup/activities/${code}`);
  revalidatePath("/setup/curriculum");
  const back = String(f.get("back") ?? "");
  if (OURS.test(back)) redirect(back);
}

/** The materials as a list (CP-53): a name and a count a row; a row left with no name goes. The engine refuses a count under 1. */
export async function setMaterials(f: FormData): Promise<void> {
  const me = await requireStaff();
  const code = String(f.get("code") ?? "");
  const names = f.getAll("name").map((v) => String(v).trim());
  const counts = f.getAll("count").map((v) => String(v).trim());
  const items = names.flatMap((name, i) => (name ? [{ name, quantity: counts[i] ? Number(counts[i]) : null }] : []));
  const res = await engineSend("/curriculum/page/materials", { actor: me.email, code, items } as never);
  if (!res.ok && res.status !== 422) throw new EngineDown(`The engine refused that (${res.status}).`);
  revalidatePath(`/setup/activities/${code}`);
  revalidatePath("/setup/curriculum");
  const back = String(f.get("back") ?? "");
  if (OURS.test(back)) redirect(back);
}
