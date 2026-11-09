"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff } from "./auth";
import { mayUse } from "./access";
import { ACTING_AS } from "./acting-view";

// Acting as (docs/frontend/screens.json `bar`): a coordinator looks at the site as an educator sees it. A view, never a
// permission: it hides the coordinator's door (Setup) and nothing else, and every address still opens for the coordinator's
// own group (lib/access.ts). The choice is a cookie of its own, kept for the browser session.
export async function setActingAs(on: boolean): Promise<void> {
  const me = await requireStaff();
  if (!mayUse(me, "setup")) return; // only a coordinator has anything to act as
  const jar = await cookies();
  if (on) jar.set(ACTING_AS, "educator", { httpOnly: true, sameSite: "lax", path: "/" });
  else jar.delete(ACTING_AS);
  revalidatePath("/", "layout");
}
