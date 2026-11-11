import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";
import { assessmentHref } from "@/lib/assessment-ui";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it (a route, so the status is a real 308).
const LIST = "/children/assessments";

const go = (request: Request, to: string) => NextResponse.redirect(new URL(to, request.url), 308);

// An assessment's card (class, week, kind, skill set): the assessment's own screen.
export async function GET(request: Request) {
  if (!(await currentStaff())) return go(request, "/login");
  const q = new URL(request.url).searchParams;
  const [section, week, kind, set] = ["class", "week", "kind", "set"].map((k) => q.get(k));
  return go(request, kind && section && week ? assessmentHref([kind, section, week, set ?? ""].join("~")) : LIST);
}
