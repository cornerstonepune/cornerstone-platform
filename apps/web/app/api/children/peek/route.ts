import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";
import { childOf, historyOf } from "@/lib/children-peek";

// ChildPeek's history (UI-3b): one child, by class and Sr. No. (never a name), newest first. A class that is not the person's
// answers 404, the same as no such child, so nothing of another class is learned. Signed out: refused.
export async function POST(request: Request) {
  const me = await currentStaff();
  if (!me) return NextResponse.json({ detail: "Sign in first." }, { status: 401 });
  let body: { class?: unknown; roll?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Send the child as JSON." }, { status: 400 });
  }
  if (typeof body.class !== "string" || typeof body.roll !== "string") return NextResponse.json({ detail: "Name the class and the Sr. No." }, { status: 400 });
  const child = await childOf(me, body.class, body.roll);
  if (!child) return NextResponse.json({ detail: "Not found." }, { status: 404 });
  return NextResponse.json({ entries: await historyOf(child.id) }, { headers: { "Cache-Control": "no-store" } });
}
