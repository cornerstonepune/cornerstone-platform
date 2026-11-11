"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";

// A level's sentence changed from the skill screen (CP-31's route). The engine keeps who and why, withdraws that level's approval,
// and refuses a stranger, an empty sentence or one over 400 characters with its own words, which are shown as they come.
export async function changeWords(f: FormData): Promise<void> {
  const me = await requireStaff();
  const skill = String(f.get("set") ?? "");
  const code = String(f.get("code") ?? "");
  const res = await engineSend("/curriculum/level-words", {
    actor: me.email,
    skill,
    level: String(f.get("level") ?? ""),
    words: String(f.get("words") ?? ""),
    reason: String(f.get("reason") ?? "").trim() || null,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new EngineDown(typeof body.detail === "string" ? body.detail : `The engine refused that (${res.status}).`);
  }
  revalidatePath(`/setup/skills/${code}`);
}
