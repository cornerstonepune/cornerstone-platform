import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

// A class against its topics moved (UI-3i): it is the "Matrix" tab of the class picture. An old address answers 308 and goes there with the
// topic it had open; the class picture refuses a class the person may not see, as for any class.
export async function GET(req: Request, { params }: { params: Promise<{ section: string }> }) {
  await requireStaff();
  const url = new URL(req.url);
  const [cls] = await sql<{ id: string }[]>`select id from school_class where label = ${decodeURIComponent((await params).section)} limit 1`;
  if (!cls) return new NextResponse("No such class", { status: 404 });
  const to = new URLSearchParams({ view: "matrix" });
  const topic = url.searchParams.get("topic");
  if (topic) to.set("topic", topic);
  return NextResponse.redirect(new URL(`/children/${cls.id}?${to}`, url), 308);
}
