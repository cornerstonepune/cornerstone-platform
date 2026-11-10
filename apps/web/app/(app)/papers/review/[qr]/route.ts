import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { paperAddress } from "@/lib/folded-routes";

// A folded page (UI-4): a paper's review address answers 308 to the paper screen.
export async function GET(request: Request, { params }: { params: Promise<{ qr: string }> }) {
  await requireStaff();
  const { qr } = await params;
  const to = /^CS[0-9A-F]{6}$/i.test(qr) ? await paperAddress({ qr: qr.toUpperCase() }) : null;
  return NextResponse.redirect(new URL(to ?? "/children/assessments", request.url), 308);
}
