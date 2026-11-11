import { permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { paperScreenOf } from "@/lib/queries-assessment-extras";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it.
const LIST = "/children/assessments";
const UUID = /^[0-9a-f-]{36}$/;

// The Marking page of one paper (by its sheet): the paper screen of that copy.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  const to = UUID.test(id) ? await paperScreenOf({ sheet: id }, me) : null;
  permanentRedirect(to?.href ?? LIST);
}
