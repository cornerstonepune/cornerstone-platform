import { permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { assessmentHref } from "@/lib/assessment-ui";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it.
const LIST = "/children/assessments";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// An assessment's card (class, week, kind, skill set): the assessment's own screen.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const q = await searchParams;
  const [section, week, kind, set] = ["class", "week", "kind", "set"].map((k) => one(q[k]));
  permanentRedirect(kind && section && week ? assessmentHref([kind, section, week, set ?? ""].join("~")) : LIST);
}
