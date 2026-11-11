import { notFound, permanentRedirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | undefined>> };

// A class against its topics moved (UI-3h): it is the "Matrix" tab of the class picture. An old address goes there with the topic it had
// open; the class picture refuses a class the person may not see, as for any class.
export default async function ClassPage({ params, searchParams }: Props) {
  await requireStaff();
  const section = decodeURIComponent((await params).section);
  const [cls] = await sql<{ id: string }[]>`select id from school_class where label = ${section} limit 1`;
  if (!cls) notFound();
  const q = await searchParams;
  const to = new URLSearchParams({ view: "matrix" });
  if (q.topic) to.set("topic", q.topic);
  permanentRedirect(`/children/${cls.id}?${to}`);
}
