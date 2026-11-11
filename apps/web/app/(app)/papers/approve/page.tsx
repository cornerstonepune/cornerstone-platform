import { permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

// UI-4: the page this address was is now a screen of Assessments; a bookmark or an old link answers 308 to it.
const LIST = "/children/assessments";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

// A class's week to approve: the list of its assessments, each with its own pack to approve.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const q = await searchParams;
  const keep = new URLSearchParams(Object.entries({ class: one(q.class) ?? one(q.section), week: one(q.week), kind: one(q.kind) }).filter((e): e is [string, string] => !!e[1]));
  permanentRedirect(`${LIST}${keep.size ? `?${keep}` : ""}`);
}
