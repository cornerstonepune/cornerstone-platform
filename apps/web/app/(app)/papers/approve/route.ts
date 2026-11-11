import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it (a route, so the status is a real 308).
const LIST = "/children/assessments";

const go = (request: Request, to: string) => NextResponse.redirect(new URL(to, request.url), 308);

// A class's week to approve: the list of its assessments, each with its own pack to approve.
export async function GET(request: Request) {
  if (!(await currentStaff())) return go(request, "/login");
  const q = new URL(request.url).searchParams;
  const keep = new URLSearchParams(Object.entries({ class: q.get("class") ?? q.get("section"), week: q.get("week"), kind: q.get("kind") }).filter((e): e is [string, string] => !!e[1]));
  return go(request, `${LIST}${keep.size ? `?${keep}` : ""}`);
}
