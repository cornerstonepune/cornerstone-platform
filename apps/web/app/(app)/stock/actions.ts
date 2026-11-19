"use server";

import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { said } from "@/lib/money-queue";

// The writes of Stock (CP-82): one engine call each, the person's email as `actor`. Nothing is decided here: the engine says who may, what is too much and
// what needs a reason, and its refusal comes back in its own words, to stand beside the field it names.
export type Kind = "in" | "out" | "minimum" | "writeoff";
export type Sent = { campus: string; code: string; quantity: string; class_label: string; claim: string; minimum: string; reason: string };
export type Recorded = { ok: true } | { ok: false; error: string };
export type Counted = { ok: true } | { ok: false; error: string; reasons: string[] };

const down = (e: unknown): string => {
  if (e instanceof EngineDown) return e.message;
  throw e;
};

export async function record(kind: Kind, v: Sent): Promise<Recorded> {
  const me = await requireStaff();
  const base = { actor: me.email, campus: v.campus, material_code: v.code };
  try {
    const res =
      kind === "in"
        ? await engineSend("/stock/in", { ...base, quantity: v.quantity.trim(), expense_id: v.claim || null })
        : kind === "out"
          ? await engineSend("/stock/out", { ...base, quantity: v.quantity.trim(), class_label: v.class_label.trim() })
          : kind === "writeoff"
            ? await engineSend("/stock/writeoff", { ...base, quantity: v.quantity.trim(), reason: v.reason.trim() })
            : await engineSend("/stock/minimum", { ...base, minimum: v.minimum.trim() });
    if (!res.ok) return { ok: false, error: await said(res) };
  } catch (e) {
    return { ok: false, error: down(e) };
  }
  return { ok: true };
}

/** A count: what was typed for each item (the ones left empty are not counted) and, for a difference the engine asked a reason for, the reason. */
export async function countStore(campus: string, lines: { material_code: string; counted: string; reason: string }[]): Promise<Counted> {
  const me = await requireStaff();
  try {
    const res = await engineSend("/stock/count", {
      actor: me.email,
      campus,
      lines: lines.map((l) => ({ material_code: l.material_code, counted: l.counted.trim(), reason: l.reason.trim() || null })),
    });
    if (!res.ok) return { ok: false, error: await said(res), reasons: [] };
  } catch (e) {
    return { ok: false, error: down(e), reasons: [] };
  }
  return { ok: true };
}
