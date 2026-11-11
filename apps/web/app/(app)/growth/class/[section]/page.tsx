import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Body, PageHeader } from "@/components/parts";
import { requireStaff } from "@/lib/auth";
import { NotYours } from "@/components/not-yours";
import { isMine } from "@/lib/scope";
import { reachOf } from "@/lib/reach";
import { ClassMatrix, loadMatrix } from "@/components/children/class-matrix";

type Props = { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | undefined>> };

// A class (goals/ux4-class-and-child.yaml): the body is components/children/class-matrix.tsx, shared with the class picture's Matrix view.
export default async function ClassPage({ params, searchParams }: Props) {
  const me = await requireStaff();
  const section = decodeURIComponent((await params).section);
  if (!isMine(await reachOf(me), section)) return <NotYours what={section} />;
  const m = await loadMatrix(section, me.email);
  if (!m.children.length) notFound();
  const { children, g, band } = m;
  return (
    <>
      <PageHeader
        stage="Children · class"
        title={section}
        sub={`${g.name(band)} · ${children.length} ${children.length === 1 ? "child" : "children"}, each against the topics the class has answers in, from checked papers only. A topic opens its skills; a name opens the child.`}
      />
      <Body>
        <p className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-basalt/62">
          <Link href="/growth" className="chip">
            ← All classes
          </Link>
        </p>
        <ClassMatrix m={m} asked={(await searchParams).topic} here={`/growth/class/${encodeURIComponent(section)}`} childHref={(c) => `/growth/${c.id}`} />
      </Body>
    </>
  );
}
