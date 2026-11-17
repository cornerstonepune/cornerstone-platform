import { redirect } from "next/navigation";

// Skills to approve folded into Curriculum (CP-65): the old address lands in the same place, its choices kept.
export default async function SkillsToApproveMoved({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const s = new URLSearchParams({ approve: "1" });
  for (const [k, v] of Object.entries(q)) if (v) s.set(k, v);
  redirect(`/setup/curriculum?${s}`);
}
