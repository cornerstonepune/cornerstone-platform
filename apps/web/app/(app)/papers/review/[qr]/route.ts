import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";
import { paperScreenOf } from "@/lib/queries-assessment-extras";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it (a route, so the status is a real 308).
const LIST = "/children/assessments";

const go = (request: Request, to: string) => NextResponse.redirect(new URL(to, request.url), 308);

// A home assessment's copy before it prints (by its paper code): the paper screen of that copy.
export async function GET(request: Request, { params }: { params: Promise<{ qr: string }> }) {
  const me = await currentStaff();
  if (!me) return go(request, "/login");
  const { qr } = await params;
  const to = /^CS[0-9A-F]{6}$/i.test(qr) ? await paperScreenOf({ qr: qr.toUpperCase() }, me) : null;
  return go(request, to?.href ?? LIST);
}
