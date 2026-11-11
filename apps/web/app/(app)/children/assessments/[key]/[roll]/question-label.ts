import type { CaptureAnswer } from "@/lib/queries-read";

/** The name a question goes by on the paper, as the old Marking page called it: its slot ("4a" where a question has parts, else its number),
 *  else its place on the page. */
export const qLabel = (a: Pick<CaptureAnswer, "n" | "slot">, index = -1) => a.slot || a.n || (index >= 0 ? index + 1 : "");
