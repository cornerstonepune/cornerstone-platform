import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { FilterBar } from "@/components/filter-bar";
import Link from "@/components/link";
import { NotYours } from "@/components/not-yours";
import { requireStaff } from "@/lib/auth";
import { givable } from "@/lib/grants";
import { grantChanges, grantsOf, schoolFacts, shortDate, namesMayShow, staffLines, type StaffLine } from "@/lib/queries-coordinator";
import { rolesHeld } from "@/lib/queries-staff";
import { NOT_ADDED } from "@/lib/staff-add";
import { Notice } from "@/components/parts";
import { AddPerson } from "./add-person";
import { personOpened } from "./person-panel";
import type { Column } from "@/lib/ux-rules";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/setup/staff";

// Staff (docs/frontend/screens.json `staff`, UI-5; page charter Part C "Staff · Classes: keep, Workspace"). On the left who holds which
// role for which class, and three numbers per person that the database can stand behind. The rows are in the role's own order then name
// and cannot be sorted by the numbers (no sort link, no rank, no ordinal, no colour on a number): the school decides what they mean. A
// person opens on the right (`?open=person:<id>`; the old `?person=<id>` still opens them) with their Grants and Roles; a grant is given or
// ended there (the engine's routes), never edited or deleted. Names are `pii`: only the 'everything' group sees them.
export default async function StaffPage({ searchParams }: Props) {
  const me = await requireStaff();
  if (!(await namesMayShow())) return <NotYours what="Staff" />;
  const q = await searchParams;
  const { lines: all, answered } = await staffLines(me.email);
  const text = q.q?.trim().toLowerCase();
  const shown = all.filter((p) => (!q.role || p.roleLabel === q.role) && (!text || `${p.name} ${p.email}`.toLowerCase().includes(text)));
  const want = parseOpen(q.open) ?? (q.person ? { kind: "person", id: q.person } : null);
  const open = want?.kind === "person" ? all.find((p) => p.id === want.id) : undefined;
  const [grants, held, options, changes, facts] = await Promise.all([
    open ? grantsOf(open.id) : Promise.resolve([]),
    rolesHeld(),
    open ? givable(me.email) : Promise.resolve(null),
    grantChanges(),
    schoolFacts(),
  ]);
  // a grant is signed with the coordinator's staff id (the engine's give), older ones with a word: the name when the list knows the id
  const names = new Map(all.map((p) => [p.id, p.name]));
  const byName = (by: string) => names.get(by) ?? (/^[0-9a-f]{8}-/i.test(by) ? "a former member of staff" : by);
  const roles = [...new Set(all.map((p) => p.roleLabel))];
  // this address with the filters kept and the panel as asked: the row links and the panel's close keep what the list shows
  const here = (over: { open?: string } = {}) => {
    const u = new URLSearchParams(Object.entries({ role: q.role, q: q.q, ...over }).filter((e): e is [string, string] => !!e[1]));
    return u.size ? `${HERE}?${u}` : HERE;
  };
  const columns: Column<StaffLine>[] = [
    {
      key: "name",
      label: "Name",
      width: "11rem",
      keep: true,
      value: (p) => p.name,
      cell: (p) => (
        <Link href={here({ open: `person:${p.id}` })} scroll={false} data-staff-row data-open-key={`person:${p.id}`} aria-current={open?.id === p.id ? "true" : undefined}>
          {p.name}
        </Link>
      ),
    },
    { key: "role", label: "Role", width: "9rem", keep: true, value: (p) => p.roleLabel },
    { key: "class", label: "Class", keep: true, value: (p) => (p.classes ? p.classes.join(", ") : "Every class") },
    { key: "sessions", label: "Sessions done of planned", width: "6.5rem", num: true, value: (p) => (p.planned ? `${p.done} of ${p.planned}` : null) },
    { key: "confirmed", label: "Notes confirmed", width: "5.5rem", num: true, value: (p) => p.notesConfirmed },
    { key: "late", label: "Notes late", width: "5rem", num: true, value: (p) => p.notesLate },
    { key: "lines", label: "Lines accepted / changed / removed", width: "8rem", num: true, value: (p) => (p.lines ? `${p.lines.accepted} / ${p.lines.changed} / ${p.lines.removed}` : null) },
  ];
  // the summary: how many people, and how many hold each of the first three roles in the roles' own order (whole counts, never a rank)
  const byRole = [...Map.groupBy([...all].sort((a, b) => a.roleOrd - b.roleOrd), (p) => p.roleLabel)].slice(0, 3);
  const stats = [{ id: "staff", n: all.length, line: "on the staff" }, ...byRole.map(([label, people]) => ({ id: label, n: people.length, line: label }))];
  return (
    <Screen
      stage={`This fortnight${facts.now ? ` · Fortnight ${facts.now.number ?? ""}, ${shortDate(facts.now.from)} to ${shortDate(facts.now.to)}` : ""} · ${all.length} staff`}
      title="Staff and classes"
      purpose="Who teaches which class, and whole counts you can rely on. No score, no ranking: the school decides what they mean."
      action={<AddPerson roles={held} />}
      panel={
        <DetailPanel
          open={open ? personOpened(open, { grants, options, byName, tab: q.tab, closeHref: here() }) : null}
          summary={{ title: "The staff", stats, after: <p className="b-label b-muted">Choose a person to see their grants and roles here.</p> }}
        />
      }
    >
      {q.added ? (
        <Notice tone="neem">
          The new member of staff is on the staff list, and a link to set their own password is on its way to their email. It works once and lasts seven days. Their classes and subjects come from their grants.
        </Notice>
      ) : null}
      {q.refused ? <Notice tone="terracotta">Nobody was added: {NOT_ADDED[q.refused] ?? "that cannot be saved"}.</Notice> : null}
      {q.denied ? <Notice tone="terracotta">Nothing changed: only the coordinators can change the staff list.</Notice> : null}
      {answered ? null : <p className="text-[13px] text-[var(--ink-muted)] mb-2">The note counts are not available right now.</p>}
      <FilterBar
        action={HERE}
        filters={[{ name: "role", label: "Role", value: q.role, all: "Every role", options: roles.map((r) => [r, r] as const) }]}
        search={{ name: "q", value: q.q, placeholder: "Find a person" }}
        keep={{ open: q.open }}
      />
      {shown.length ? (
        <DataTable label="Staff" columns={columns} rows={shown} rowKey={(p) => p.id} counted more={{ by: (p) => p.roleLabel.replace(/ \(.*\)$/, "") }} />
      ) : (
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">Nobody matches these filters.</p>
      )}
      <section aria-label="Last changes to grants" className="mt-6">
        <h2 className="mb-2 text-[16px]">Last changes to grants</h2>
        {changes.length ? (
          <ul className="grid gap-2">
            {changes.map((c) => (
              <li key={c.id}>
                {c.line}
                <div className="text-[13px] text-[var(--ink-muted)]">
                  {c.note} {shortDate(c.at)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--ink-muted)]">No grant has been added or ended yet.</p>
        )}
      </section>
    </Screen>
  );
}
