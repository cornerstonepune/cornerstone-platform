import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { Notice } from "@/components/parts";
import { requireStaff } from "@/lib/auth";
import { choices } from "@/lib/choices";
import { people } from "@/lib/queries-staff";
import { StaffTable } from "./staff-table";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Staff, for reading (goals/uxn2-staff-and-school.yaml; UI-5 moved the editing to Staff and classes, /setup/staff, where a class or
// subject is given or ended as a grant). The classes and subjects shown are the columns the sign-in reads until backend's #615 reads
// grants; this page goes when that has been live (plan in docs/notes/UI-5.md).
export default async function StaffPage({ searchParams }: Props) {
  await requireStaff();
  const q = await searchParams;
  const [all, offered] = await Promise.all([people(), choices()]);
  const text = q.q?.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (!q.role || p.role === q.role) &&
      (!text || `${p.name} ${p.email}`.toLowerCase().includes(text)),
  );
  const roles = [...new Set(all.map((p) => p.role))].sort();
  const page = Math.max(1, Number(q.page) || 1);
  return (
    <Screen
      stage="School"
      title="Staff"
      purpose="Who teaches which class and subject, for reading. Changes are made on Staff and classes."
      action={
        <Link href="/setup/classes" className="btn">
          See the school&rsquo;s classes
        </Link>
      }
      next={{ href: "/", label: "Curriculum" }}
    >
      <Notice tone="neem">
        This list is for reading. To add a person, give or end a class or a subject, use{" "}
        <Link href="/setup/staff">Staff and classes</Link>.
      </Notice>
      <FilterBar
        action="/staff"
        filters={[
          {
            name: "role",
            label: "Role",
            value: q.role,
            all: "Every role",
            options: roles.map((r) => [r, r] as const),
          },
        ]}
        search={{ name: "q", value: q.q, placeholder: "Find a person" }}
      />
      <StaffTable
        people={shown}
        subjects={offered.subjects}
        page={page}
        pageHref={(n) =>
          `/staff?${new URLSearchParams({ ...(q.role ? { role: q.role } : {}), ...(q.q ? { q: q.q } : {}), ...(n > 1 ? { page: String(n) } : {}) })}`
        }
      />
      {shown.length === 0 ? (
        <p className="note mt-2">Nobody matches these filters.</p>
      ) : null}
    </Screen>
  );
}
