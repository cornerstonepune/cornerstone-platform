import { cookies } from "next/headers";
import { mayUse } from "./access";
import type { Session } from "./auth";

export const ACTING_AS = "cs_acting_as";

/** Whether this coordinator is looking at the site as an educator would (a view; the person is still the coordinator). */
export async function actingAsEducator(me: Pick<Session, "role">): Promise<boolean> {
  return mayUse(me, "setup") && (await cookies()).get(ACTING_AS)?.value === "educator";
}
