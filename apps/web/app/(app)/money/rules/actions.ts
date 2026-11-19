"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { type Draft, refusal, rulesFrom, rulesOf } from "@/lib/money-rules";

// The Rules screen's one write: the person's draft laid over the rules as they are now, sent to the engine (`/money/rules/set`) with their email as
// `actor`. Nothing is decided here: a refusal comes back in the engine's own words and the page keeps what was typed. A save goes back to the page
// with "Saved", which then shows the new history.

export type Said = { error: string } | null;

export async function saveRules(draft: Draft): Promise<Said> {
  const me = await requireStaff();
  try {
    const now = await rulesOf(me.email, false);
    if (now.version !== draft.version) return { error: "Someone changed the rules while you were editing. Reload the page to see their change, then make yours again." };
    const res = await engineSend("/money/rules/set", {
      actor: me.email,
      rules: rulesFrom(now.rules, draft),
      categories: draft.categories,
      reason: draft.reason.trim() || null,
    });
    if (!res.ok) return { error: await refusal(res, "That was not saved.") };
  } catch (e) {
    if (e instanceof EngineDown) return { error: e.message };
    throw e;
  }
  redirect("/money/rules?saved=1");
}
