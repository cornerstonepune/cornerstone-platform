import { permanentRedirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

// The skill set moved into the new frame at /setup/skill-sets/[code] (UI-3c); next.config.ts answers the old address 308 before
// this page is reached, and this is the same answer for anything that renders it directly. The parts the page carries (level
// approval, grades, ways, samples, kinds, more-like-this and their actions) still live beside it, used by the new page.
export default async function MovedSkillSet({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const [{ code }, q] = await Promise.all([params, searchParams]);
  const keep = new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]])));
  permanentRedirect(`/setup/skill-sets/${encodeURIComponent(code)}${keep.size ? `?${keep}` : ""}`);
}
