import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";
import { paperScreenOf } from "@/lib/queries-assessment-extras";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it (a route, so the status is a real 308).
const LIST = "/children/assessments";
const UUID = /^[0-9a-f-]{36}$/;

const go = (request: Request, to: string) => NextResponse.redirect(new URL(to, request.url), 308);

// The queue of answers to check (one answer by `?id=`): the paper screen of the copy it is on, that answer in view.
export async function GET(request: Request) {
  const me = await currentStaff();
  if (!me) return go(request, "/login");
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const to = UUID.test(id) ? await paperScreenOf({ result: id }, me) : null;
  return go(request, to ? `${to.href}?answer=${to.answer}#a-${to.answer}` : LIST);
}
