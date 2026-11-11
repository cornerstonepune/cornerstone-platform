import { DataTable } from "@/components/data-table";
import Link from "@/components/link";
import type { Person } from "@/lib/queries-staff";
import type { Column } from "@/lib/ux-rules";
import type { Subject as SubjectLine } from "@/lib/viewing";

export function StaffTable({
  people,
  subjects,
  page,
  pageHref,
}: {
  people: Person[];
  subjects: SubjectLine[];
  page: number;
  pageHref: (page: number) => string;
}) {
  const columns: Column<Person>[] = [
    {
      key: "name",
      label: "Person",
      width: "14rem",
      keep: true,
      value: (p) => p.name,
      cell: (p) => (
        <>
          <div>{p.id ? <Link href={`/setup/staff?person=${p.id}#grants`}>{p.name}</Link> : p.name}</div>
          <div className="text-[12px] text-basalt/60">{p.email}</div>
        </>
      ),
    },
    {
      key: "role",
      label: "Role",
      width: "9rem",
      keep: true,
      value: (p) => p.role,
    },
    {
      key: "classes",
      label: "Classes they teach",
      keep: true,
      value: (p) => p.classes.join(", "),
      cell: (p) => p.classes.join(", ") || "No class yet",
    },
    {
      key: "subjects",
      label: "Subjects they teach",
      keep: true,
      value: (p) => p.subjects.join(", "),
      cell: (p) => subjects.filter((s) => p.subjects.includes(s.code)).map((s) => s.label).join(", ") || "Every subject",
    },
  ];
  return (
    <DataTable
      label="Staff"
      columns={columns}
      rows={people}
      rowKey={(p) => p.email}
      more={{ page, href: pageHref }}
      extras={{ attrs: (p) => ({ "data-person": p.email }) }}
    />
  );
}
