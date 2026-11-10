import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/auth";
import { suggest } from "@/lib/search";

// The bar's typeahead (docs/frontend/screens.json `bar`): the typed term arrives in the body of a POST and is answered with at
// most five suggestions. It is in no address, and nothing here writes it to a log or to an analytics call. Signed out: refused.
export async function POST(request: Request) {
  const me = await currentStaff();
  if (!me) return NextResponse.json({ detail: "Sign in first." }, { status: 401 });
  let typed = "";
  try {
    const body = (await request.json()) as { q?: unknown };
    typed = typeof body.q === "string" ? body.q : "";
  } catch {
    return NextResponse.json({ detail: "Send the search as JSON." }, { status: 400 });
  }
  return NextResponse.json({ hits: await suggest(me, typed) }, { headers: { "Cache-Control": "no-store" } });
}
