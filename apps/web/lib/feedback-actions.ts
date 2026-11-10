"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireStaff } from "./auth";
import { limits, reporterMark, saveNote, sendWaiting, tooMany } from "./feedback";
import { browserOf, refusal, routeOnly } from "./feedback-words";

// "Report a problem or suggest something" (goals/feed_report_from_the_tool.yaml): staff only, checked here again as
// every action is. The note is saved before anything else; GitHub is tried after the answer has gone back, so the person
// is thanked whether or not GitHub answers, and only once the note is kept.

/** What the person is told; when a note is refused, what they typed comes back so the boxes keep it. */
export type Said = { ok: boolean; words: string; kept?: Record<string, string> } | null;

export async function submitNote(_: Said, form: FormData): Promise<Said> {
  const me = await requireStaff();
  const what = String(form.get("what") ?? "").trim();
  const from = routeOnly(String(form.get("where") ?? "/"));
  const no = (words: string): Said => ({ ok: false, words, kept: { what, where: String(form.get("where") ?? "") } });
  if (!what) return no("Please say what happened, or what you would like.");
  const { perHour, maxChars } = await limits();
  if (what.length > maxChars) return no(`Please keep it under ${maxChars} characters.`);
  const refused = refusal(what, from);
  if (refused) return no(refused);
  const reporter = reporterMark(me.email);
  if (await tooMany(reporter, perHour)) {
    return no(`You have sent ${perHour} notes in the last hour. Please wait a little before the next one.`);
  }
  const head = await headers();
  // One box holds the person's words, so it is both columns of the note; the kind is the neutral one, since the form no
  // longer asks (the team reads every note and decides what it is). "doing" says where the note was written, in the
  // system's words and not the person's.
  const id = await saveNote(
    { kind: "question", doing: `Written on ${from}`, happened: what, howOften: null, route: from, role: me.role, classes: me.role === "coordinator" ? "" : (me.classes ?? []).join(", "), browser: browserOf(head.get("user-agent") ?? "") },
    reporter,
  );
  after(() => sendWaiting(id));
  revalidatePath("/feedback");
  return { ok: true, words: "Thanks, it reached the team." };
}
