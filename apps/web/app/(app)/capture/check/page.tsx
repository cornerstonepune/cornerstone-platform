import { permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { paperScreenOf } from "@/lib/queries-assessment-extras";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it.
const LIST = "/children/assessments";
const UUID = /^[0-9a-f-]{36}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// The queue of answers to check (one answer by `?id=`): the paper screen of the copy it is on, that answer in view.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireStaff();
  const id = one((await searchParams).id);
  const to = id && UUID.test(id) ? await paperScreenOf({ result: id }, me) : null;
  permanentRedirect(to ? `${to.href}?answer=${to.answer}#a-${to.answer}` : LIST);
}
