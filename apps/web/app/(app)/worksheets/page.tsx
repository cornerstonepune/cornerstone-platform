import { redirect } from "next/navigation";
import { Body, PageHeader } from "@/components/parts";
import { Library } from "./library";
import { requireStaff } from "@/lib/auth";
import { ownClasses, scopeOf } from "@/lib/scope";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Worksheets (goals/ui3-curriculum.yaml): the library, every question in the bank on a numbered worksheet, by skill and
// level. A class's week of papers is approved under Assessments (/children/assessments); its old address here opens it there.
export default async function WorksheetsPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  if (q.section) {
    const kept = Object.entries({ ...q, class: q.section, section: undefined }).filter((e): e is [string, string] => typeof e[1] === "string");
    redirect(`/children/assessments?${new URLSearchParams(kept).toString()}`);
  }
  return (
    <>
      <PageHeader
        stage="Curriculum · Worksheets"
        title="Worksheets"
        sub="Every question in the bank on a numbered worksheet, by skill and level. A class's papers for a week are approved under Assessments."
      />
      <Body>
        <Library q={q} scope={scopeOf(me)} own={ownClasses(me)} />
      </Body>
    </>
  );
}
