"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deciding, mustSee } from "@/lib/decides";
import { EngineDown, enginePost } from "@/lib/engine";
import { paperHref } from "@/lib/assessment-ui";

const UUID = /^[0-9a-f-]{36}$/;

/** A person says what the child actually wrote for ONE answer (empty: the child wrote nothing, so blank, never wrong). The
 *  engine marks it; the person's word is a new `read_correction` row beside the engine's own read, which stays as it was. */
export async function sayWhatWasWritten(f: FormData): Promise<void> {
  const me = await deciding("answers");
  const key = String(f.get("key") ?? "");
  const roll = String(f.get("roll") ?? "");
  const result = String(f.get("result_id") ?? "");
  const paper = String(f.get("paper_id") ?? "");
  const blank = f.get("blank") !== null;
  const wrote = blank ? "" : String(f.get("human_read") ?? "").trim().slice(0, 40);
  if (!UUID.test(result) || !UUID.test(paper) || !key || !roll) redirect("/children/assessments");
  await mustSee(me, "answers", [{ result }, { sheet: paper }]);
  const here = paperHref(key, roll);
  if (!blank && !wrote) redirect(`${here}?answer=${result}`);
  try {
    await enginePost("/capture/correct", { result_id: result, human_read: wrote, by: me.email });
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    redirect(`${here}?said=${encodeURIComponent("The engine is not answering; nothing was changed.")}`);
  }
  revalidatePath(here);
  redirect(here);
}
