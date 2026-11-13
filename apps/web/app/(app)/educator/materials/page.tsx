import { redirect } from "next/navigation";

// The class's materials list moved into the Timetable's Materials (page charter C: one Workspace, the list by day on the left and a
// line's detail, with its quantity and Remove, on the right). An old link lands there with its class, day and span.
export default async function OldMaterialsPage({ searchParams }: { searchParams: Promise<{ class?: string; day?: string; span?: string }> }) {
  const q = await searchParams;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ class: q.class, day: q.day, span: q.span })) if (v) p.set(k, v);
  const s = p.toString();
  redirect(s ? `/timetable/materials?${s}` : "/timetable/materials");
}
