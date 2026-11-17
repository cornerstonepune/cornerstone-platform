import { revalidateTag } from "next/cache";
import { CURRICULUM_TAG } from "@/lib/curriculum-cache";
import { testHook, testHooksOn } from "@/lib/test-hooks";

// The tests' own door onto lib/test-hooks.ts; a 404 on any run that is not a test run.
// GET: the reads noted since the last call (and the list is cleared). POST: { match, delayMs, fail } sets what the hook does;
// { expire: true } makes the cached curriculum reads stale, as the 60 seconds would, for a test that wrote rows behind the page's back.
export async function GET() {
  if (!testHooksOn()) return new Response("Not found", { status: 404 });
  const h = testHook();
  const log = h.log.splice(0);
  return Response.json({ log });
}

export async function POST(req: Request) {
  if (!testHooksOn()) return new Response("Not found", { status: 404 });
  const body = (await req.json()) as { match?: string; delayMs?: number; fail?: boolean; expire?: boolean };
  const h = testHook();
  if (body.expire) revalidateTag(CURRICULUM_TAG, { expire: 0 });
  if ("match" in body) h.match = body.match ?? "";
  if ("delayMs" in body) h.delayMs = body.delayMs ?? 0;
  if ("fail" in body) h.fail = !!body.fail;
  return Response.json({ ok: true });
}
