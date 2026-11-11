import { permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { paperScreenOf } from "@/lib/queries-assessment-extras";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it.
const LIST = "/children/assessments";

// A home assessment's copy before it prints (by its paper code): the paper screen of that copy.
export default async function Page({ params }: { params: Promise<{ qr: string }> }) {
  const me = await requireStaff();
  const { qr } = await params;
  const to = /^CS[0-9A-F]{6}$/i.test(qr) ? await paperScreenOf({ qr: qr.toUpperCase() }, me) : null;
  permanentRedirect(to?.href ?? LIST);
}
