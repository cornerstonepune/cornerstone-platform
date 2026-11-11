"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { voiceTicket } from "@/lib/engine";
import { myVoice, voiceOn } from "@/lib/voice";

// The K2 voice notes' one write from this folder (task M1-04): her recording's ticket. A note is confirmed from /notes/[id]
// (app/(app)/notes/actions.ts).

/** Voice notes switched on, after the action has checked who is asking (`requireStaff`, in the action itself). */
async function switchedOn() {
  if (!(await voiceOn())) redirect("/today");
}

/** Leave for this page to send her recording straight to the engine (a ticket good for half an hour). */
export async function recordTicket(): Promise<{ url: string; token: string } | null> {
  const me = await requireStaff();
  await switchedOn();
  if (!(await myVoice(me))?.recording) return null; // D-065: no ticket to send a recording while recording is off
  return voiceTicket(me.email);
}
