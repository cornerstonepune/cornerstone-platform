import { after } from "next/server";
import { DataTable } from "@/components/data-table";
import { Screen } from "@/components/app-frame";
import { ReportForm } from "@/components/report-form";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { routeOnly } from "@/lib/feedback-words";
import { limits, myReports, reporterMark, sendWaiting, type MyReport } from "@/lib/feedback";
import { type Seen } from "@/lib/feedback-words";
import type { Column } from "@/lib/ux-rules";
import { dateWords } from "@/lib/week";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Report a problem or suggest something (goals/feed_report_from_the_tool.yaml). Nimish, 27 Oct 2026: "one can raise a
// feature request or file a bug, and that directly reaches you as an issue, and then we decide to work on it." Reached
// from the top bar of every page, which says where the person came from (`from`). Opening the page also tries again the
// notes that have not reached GitHub yet, after the page has answered.
const CHIP: Record<Seen, [State, string]> = {
  received: ["notYet", "received"],
  takenUp: ["waiting", "taken up"],
  done: ["done", "done"],
};

const columns: Column<MyReport>[] = [
  { key: "title", label: "What", value: (r) => r.title },
  { key: "route", label: "Where", value: (r) => r.route, width: "14rem" },
  { key: "on", label: "Sent", value: (r) => dateWords(r.created_at.toISOString()), width: "8rem" },
  { key: "seen", label: "State", status: true, value: (r) => r.seen, cell: (r) => <StatusChip state={CHIP[r.seen][0]} words={CHIP[r.seen][1]} />, width: "9rem" },
];

export default async function ReportPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const [mine, { maxChars }] = await deadline(Promise.all([myReports(reporterMark(me.email)), limits()]));
  after(() => sendWaiting());
  const page = Number(q.page) || 1;
  return (
    <Screen
      stage="To the team"
      title="Report a problem or suggest something"
      purpose="Tell us what is broken, what you would like, or ask a question. It reaches the team, who decide what is built."
      action={<span className="b-muted">One note at a time, in your own words.</span>}
      next={{ href: routeOnly(q.from ?? "/today"), label: "Back to the page you came from" }}
    >
      <ReportForm from={routeOnly(q.from ?? "/")} maxChars={maxChars} />
      <section className="mt-8" aria-label="Your reports">
        <h2 className="mb-2 text-[16px]">Your reports</h2>
        {mine.length ? (
          <DataTable
            label="Your reports"
            columns={columns}
            rows={mine}
            rowKey={(r) => r.id}
            more={{ page, href: (n: number) => `/feedback?page=${n}` }}
            extras={{ attrs: (r) => ({ "data-report": r.seen }) }}
          />
        ) : (
          <p className="b-muted">Nothing sent yet. What you send shows here, and whether it was taken up or done.</p>
        )}
        <p className="b-muted mt-2">
          Taken up means it will be built; done means it is finished.
        </p>
      </section>
    </Screen>
  );
}
