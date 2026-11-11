import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";
import { paperScreenOf } from "@/lib/queries-assessment-extras";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it (a route, so the status is a real 308).
const LIST = "/children/assessments";
const UUID = /^[0-9a-f-]{36}$/;

const go = (request: Request, to: string) => NextResponse.redirect(new URL(to, request.url), 308);

// The Marking page of one paper (by its sheet): the paper screen of that copy.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentStaff();
  if (!me) return go(request, "/login");
  const { id } = await params;
  const to = UUID.test(id) ? await paperScreenOf({ sheet: id }, me) : null;
  return go(request, to?.href ?? LIST);
}
