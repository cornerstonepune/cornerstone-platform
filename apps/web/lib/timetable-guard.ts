import { isCoordinator } from "./timetable-ui";
import type { Session } from "./auth";

/** The web layer's own check for every timetable write (UI-6 Done when 3; not signed in is 401). The engine's plan routes only check that the actor
 *  is on the staff list, so the coordinator group is checked here, before the engine is called: not signed in is 401, a member
 *  of staff who is not the coordinator is 403, and nothing is sent to the engine. */
export async function coordinatorOnly(me: Session | null): Promise<{ me: Session } | { refused: Response }> {
  if (!me) return { refused: new Response("sign in first", { status: 401 }) };
  if (!(await isCoordinator())) return { refused: new Response("that is for the coordinator", { status: 403 }) };
  return { me };
}

/** Back to a page of the site after a form post, with the engine's answer in the address. */
export const backTo = (request: Request, path: string, q: Record<string, string>) => {
  const u = new URL(path, request.url);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return Response.redirect(u, 303);
};
