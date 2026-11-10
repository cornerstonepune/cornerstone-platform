import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";

// A folded page (UI-4): the class pack to approve is the assessments of that class, week and kind, waiting for approval.
export async function GET(request: Request) {
  await requireStaff();
  const q = new URL(request.url).searchParams;
  const to = new URL("/children/assessments", request.url);
  for (const [from, as] of [["section", "class"], ["week", "week"], ["kind", "kind"]] as const) if (q.get(from)) to.searchParams.set(as, q.get(from)!);
  to.searchParams.set("status", "approve");
  return NextResponse.redirect(to, 308);
}
