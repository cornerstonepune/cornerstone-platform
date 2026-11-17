import { redirect } from "next/navigation";

// Objectives folded into Curriculum (CP-65): a grade, subject and topic lead into the flow; an origin or a word, or nothing, into the appendix's list.
export default async function ObjectivesMoved({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const s = new URLSearchParams();
  const flow = !q.origin && !q.q && !q.page && q.topic;
  if (!flow) { s.set("view", "appendix"); s.set("part", "objectives"); }
  for (const k of ["grade", "subject", "topic", "origin", "q", "page"]) if (q[k]) s.set(k, q[k]!);
  redirect(`/setup/curriculum?${s}`);
}
