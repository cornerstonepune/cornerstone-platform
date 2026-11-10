import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { grades } from "@/lib/queries";
import { reportsRows, REPORT_STATES, STATE_OF, type Consent, type ReportsRow } from "@/lib/queries-report-rows";
import { workScope } from "@/lib/reach";
import { classWords } from "@/lib/needs-you";
import type { Column } from "@/lib/ux-rules";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/children/reports";

// Reports (UI-8, docs/frontend/wireframes/reports.html): each child's parent report, where it stands, whether an educator has
// approved it and whether consent is on file. Built on what main holds today: the child's newest report and its one educator
// approval, and the consent register. Report lines, the coordinator's approval, Send and the parent's-copy PDF wait for CP-19 and
// are listed, with their reasons, in docs/notes/UI-8.md; nothing on this screen sends anything. Rows are in class and Sr. No.
// order: no figure here is a score, rate, rank or ordering of a person.
const CHIP: Record<string, State> = { "out of date": "doNow", "to approve": "toApprove", "to write": "toDo", approved: "approved", "nothing yet": "notYet" };
const CONSENT_WORDS: Record<Consent, string> = { given: "on file", withdrawn: "withdrawn", none: "not recorded" };

export default async function ReportsScreen({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const [all, g] = await deadline(Promise.all([reportsRows(me.email, await workScope(me)), grades()]));
  const classes = [...new Set(all.map((r) => r.section))];
  const f = {
    class: classes.includes(q.class ?? "") ? q.class : undefined,
    state: (REPORT_STATES as readonly string[]).includes(q.state ?? "") ? q.state : undefined,
  };
  const rows = all.filter((r) => (!f.class || r.section === f.class) && (!f.state || STATE_OF(r) === f.state));

  const columns: Column<ReportsRow>[] = [
    { key: "child", label: "Child", value: (r) => `${r.first_name} · Sr. No. ${r.roll_no}`, cell: (r) => <Link href={`/growth/${r.child_id}/parent`}>{r.first_name} · Sr. No. {r.roll_no}</Link> },
    { key: "class", label: "Class", width: "7rem", value: (r) => classWords(g, r.band, r.section) },
    { key: "state", label: "Report", status: true, width: "10rem", value: (r) => STATE_OF(r), cell: (r) => <StatusChip state={CHIP[STATE_OF(r)]} words={STATE_OF(r)} /> },
    { key: "educator", label: "Educator approved", status: true, width: "9rem", value: (r) => (r.report.note?.approved ? "yes" : "no") },
    { key: "consent", label: "Consent", width: "9rem", value: (r) => (r.consent ? CONSENT_WORDS[r.consent] : null) },
  ];

  return (
    <Screen
      stage="Children · this term"
      title="Reports"
      purpose="Each child's report, in the educator's words. Nothing goes out until it is approved and consent is on file."
      rail={
        <Rail
          edges={[
            { screen: "picture", params: { class: f.class ?? classes[0] ?? "" }, label: "The class picture", icon: "class" },
            { screen: "classes", label: "Consent", icon: "form" },
          ]}
        />
      }
    >
      <FilterBar
        action={HERE}
        filters={[
          { name: "class", label: "Class", value: f.class, all: "Every class", options: classes.map((c) => [c, c] as const) },
          { name: "state", label: "State", value: f.state, all: "Any state", options: REPORT_STATES.map((s) => [s, s] as const) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState>No report lines drafted yet</EmptyState>
      ) : (
        <DataTable
          label="Every child's report"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.child_id}
          more={{ page: Math.max(1, Math.floor(Number(q.page)) || 1), href: (n: number) => `${HERE}?${new URLSearchParams({ ...(f.class ? { class: f.class } : {}), ...(f.state ? { state: f.state } : {}), page: String(n) })}` }}
          extras={{ expand: (r) => <Words r={r} /> }}
        />
      )}
    </Screen>
  );
}

/** One child's report: the system's state beside the educator's words, read-only. A child with no report shows no words. */
function Words({ r }: { r: ReportsRow }) {
  const w = r.words;
  return (
    <Details summary={`${r.first_name}'s report`}>
      {w ? (
        <div className="grid gap-2">
          <p>{w.summary}</p>
          {[...w.can_do, ...w.working_on, ...w.at_home].length ? (
            <ul className="list-disc pl-5">
              {[...w.can_do, ...w.working_on, ...w.at_home].map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          {w.next_at_school ? <p>{w.next_at_school}</p> : null}
        </div>
      ) : (
        <p>Not written yet</p>
      )}
    </Details>
  );
}
