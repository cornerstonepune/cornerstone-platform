"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { refusal } from "@/lib/timetable-rules";

// Confirm a batch (CP-64): one grade and subject's machine-made rows become a person's, with one approval row. The engine decides (a coordinator
// only; a batch with nothing left changes nothing) and says why when it refuses; the answer comes back in the address.
const HERE = "/setup/curriculum/check";

export async function confirmBatch(form: FormData): Promise<void> {
  const me = await requireStaff();
  const grade = String(form.get("grade") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  let res: Response;
  try {
    res = await engineSend("/curriculum/confirm", { actor: me.email, grade, subject: subject || null });
  } catch (e) {
    if (e instanceof EngineDown) return redirect(`${HERE}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  if (!res.ok) return redirect(`${HERE}?error=${encodeURIComponent(await refusal(res, "That was not confirmed."))}`);
  const done = (await res.json().catch(() => ({}))) as { changed?: number };
  redirect(`${HERE}?${new URLSearchParams({ confirmed: String(done.changed ?? 0), grade, ...(subject ? { subject } : {}) })}`);
}
