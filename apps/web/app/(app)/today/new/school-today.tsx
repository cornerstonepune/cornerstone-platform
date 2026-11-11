import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Rail, Screen } from "@/components/app-frame";
import { AttentionStrip, type Attention } from "@/components/attention-strip";
import type { Session } from "@/lib/auth";
import { schoolToday } from "@/lib/school-clock";
import { StatusChip } from "@/components/status-chip";
import { dayWords, many } from "@/lib/today";
import { DOORS, open } from "@/lib/today-doors";
import { schoolNotes, type CoordinatorRow } from "@/lib/today-data";
import type { Column } from "@/lib/ux-rules";

// Today, the school's (docs/frontend/SPEC.md, Today, the school): what waits on the coordinator, each with its own button, then the week
// ahead. Built on what the engine gives today: the notes left unconfirmed across classes. Rows for work whose backend is not built
// (clashes, drafts, materials without a quantity, last week's sessions by class and day, consent) simply do not appear yet, and the
// strip's other two tiles come with them (docs/notes/UI-7.md). Whole counts only: no person is ranked, scored or ordered.
type Waiting = { key: string; what: string; many: string; href: string | null };

const COLUMNS: Column<Waiting>[] = [
  { key: "state", label: "Priority", status: true, width: "9rem", value: () => "late", cell: () => <StatusChip state="late" round /> },
  { key: "what", label: "What", value: (r) => r.what },
  { key: "many", label: "How many", width: "9rem", value: (r) => r.many },
  { key: "go", label: "", width: "12rem", value: (r) => r.key, cell: (r) => (r.href ? <Link href={r.href} className="btn secondary whitespace-nowrap" data-row={r.key}>Open them</Link> : null) },
];

const late = (rows: CoordinatorRow[]) => rows.filter((r) => r.state === "left_unconfirmed");

export async function SchoolToday({ me }: { me: Session }) {
  const [today, got] = await Promise.all([schoolToday(), schoolNotes(me)]);
  const left = late(got?.rows ?? []);
  const tiles: Attention[] = [{ state: "doNow", n: left.length, sentence: "Notes left unconfirmed across the classes", href: left.length ? open(DOORS.notes()) : null }];
  const waiting: Waiting[] = left.length ? [{ key: "late-notes", what: "Notes left unconfirmed", many: many(left.length, "note"), href: open(DOORS.notes()) }] : [];
  const edges = [
    { screen: "staff", label: "Staff and classes", icon: "class" as const, fallback: "/staff" },
    { screen: "timetable", label: "Timetable", icon: "week" as const, fallback: "/educator/week" },
  ];
  return (
    <Screen stage={`${dayWords(today)} · every class`} title="Today, the school" purpose="What waits on you, each with its own button. Then the week ahead." action={<p className="font-medium">{waiting.length ? `${many(left.length, "note")} left unconfirmed wait on you.` : "Nothing waits on you."}</p>} next={{ href: open(DOORS.timetable()) ?? "/educator/week", label: "Fortnight" }} rail={<div className="[&_[data-rail]_ul]:gap-2"><Rail edges={edges} /></div>}>
      <AttentionStrip tiles={tiles} />
      <div className="my-4">
        {waiting.length ? <DataTable label="What waits on you" columns={COLUMNS} rows={waiting} rowKey={(r) => r.key} more={{ page: 1, href: () => "/today/new" }} /> : <EmptyState>Nothing waits on you.</EmptyState>}
      </div>
    </Screen>
  );
}
