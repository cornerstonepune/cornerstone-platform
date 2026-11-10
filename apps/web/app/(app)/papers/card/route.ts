import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { assessmentHref } from "@/lib/assessment-ui";

// A folded page (UI-4): an assessment's card answers 308 to the assessment screen, its key made from the address.
export async function GET(request: Request) {
  await requireStaff();
  const q = new URL(request.url).searchParams;
  const kind = q.get("kind");
  const to = kind ? assessmentHref([kind, q.get("class") ?? "", q.get("week") ?? "", q.get("set") ?? ""].join("~")) : "/children/assessments";
  return NextResponse.redirect(new URL(to, request.url), 308);
}
