"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { refusal } from "@/lib/timetable-rules";

// The Build page's writes. One form, one engine call; the person's email is the `actor`. Nothing is decided here: the engine says who may
// write (the coordinators) and refuses in its own words, which come back on the page.

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

/** Start a class that has no day from another class's day shape and fixed rows. */
export async function startFrom(form: FormData): Promise<void> {
  const me = await requireStaff();
  const classId = text(form, "class_id");
  const from = text(form, "from_class");
  const back = (q: string) => redirect(`/timetable/build?${q}`);
  if (!classId || !from) return back(`error=${encodeURIComponent("Choose the class whose day to start from.")}`);
  let res: Response;
  try {
    res = await engineSend("/timetable/pattern/copy", { actor: me.email, class_id: classId, mode: "start_from", from_class: from });
  } catch (e) {
    if (e instanceof EngineDown) return back(`error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  if (!res.ok) return back(`error=${encodeURIComponent(await refusal(res, "That was not started."))}`);
  return redirect(`/timetable/build?class=${encodeURIComponent(classId)}`);
}
