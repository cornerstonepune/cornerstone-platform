import { currentStaff } from "@/lib/auth";
import { EngineDown, engineSend } from "@/lib/engine";
import { engineWords } from "@/lib/money-claims";

// A claim's bill, read through the engine, which says who may see it: its claimant, a person who may approve it, a person who may pay.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentStaff();
  if (!me) return new Response("sign in first", { status: 401 });
  const { id } = await params;
  try {
    const res = await engineSend("/money/claims/bill", { actor: me.email, id });
    if (!res.ok) return new Response(await engineWords(res, "No bill."), { status: res.status });
    const got = (await res.json()) as { content_type: string; b64: string };
    return new Response(Buffer.from(got.b64, "base64"), { headers: { "content-type": got.content_type, "cache-control": "private, max-age=300" } });
  } catch (e) {
    if (e instanceof EngineDown) return new Response(e.message, { status: 503 });
    throw e;
  }
}
