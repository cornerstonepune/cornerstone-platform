import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { paperAddress } from "@/lib/folded-routes";

// A folded page (UI-4): a paper's old address answers 308 to the paper screen.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const to = /^[0-9a-f-]{36}$/.test(id) ? await paperAddress({ id }) : null;
  return NextResponse.redirect(new URL(to ?? "/children/assessments", request.url), 308);
}
