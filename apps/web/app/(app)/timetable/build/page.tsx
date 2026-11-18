import { Screen } from "@/components/app-frame";
import Link from "@/components/link";
import { EmptyState } from "@/components/empty-state";
import { ViewToggle } from "@/components/kanban-board";
import { requireStaff } from "@/lib/auth";
import { headLabels, subjectLooks } from "@/lib/subject-looks";
import { buildHome, patternOf } from "@/lib/timetable-build";
import { checkOf, problemsOf } from "@/lib/timetable-check";
import { rulesOf } from "@/lib/timetable-rules";
import { isCoordinator } from "@/lib/timetable-ui";
import "../timetable.css";
import "./build.css";
import { TtError } from "../tt-error";
import { paletteFor } from "@/lib/timetable-palette";
import { PatternRead } from "./grid";
import { Builder } from "./paint";
import { BuildHomeView } from "./home";
import { ReadPanel } from "./read-panel";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const ID = /^[0-9a-f-]{36}$/i;

// The timetable builder (CP-71): the coordinator builds each class's two-week pattern here. Its own route, so the Timetable page keeps its
// size. Every read and every refusal is the engine's; a person outside the coordinators reads and is not offered a write.
export default async function BuildPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const coordinator = await isCoordinator();
  const error = q.error ? <TtError>{q.error}</TtError> : null;
  const classId = q.class && ID.test(q.class) ? q.class : null;
  // the Timetable page's views with Build chosen (CP-74): the tab that led here leads back, for the same class
  const back = (view: string) => `/timetable?${new URLSearchParams({ view, ...(classId ? { class: classId } : {}) })}`;
  const views = coordinator ? (
    <ViewToggle
      current="build"
      views={[
        { key: "day", label: "Day", icon: "today", href: back("day") },
        { key: "week", label: "Week", icon: "week", href: back("week") },
        { key: "fortnight", label: "Fortnight", icon: "fortnight", href: back("fortnight") },
        { key: "time", label: "Time by subject", icon: "time", href: back("time") },
        { key: "build", label: "Build", icon: "table", href: classId ? `/timetable/build?class=${classId}` : "/timetable/build" },
      ]}
    />
  ) : null;

  if (!classId) {
    const home = await buildHome(me.email);
    const first = home.ok ? home.data.classes.find((c) => c.has_day && c.state !== "done") : undefined;
    return (
      <Screen
        stage="Timetable"
        title="Build the timetable"
        purpose="One pattern per class; each fortnight follows it."
        action={first ? <Link href={`/timetable/build?class=${first.class_id}`} className="btn">Continue {first.name}</Link> : undefined}
        next={{ href: "/timetable", label: "See the timetable" }}
      >
        {views}
        {error}
        {home.ok ? (
          home.data.classes.length ? (
            <BuildHomeView home={home.data} coordinator={coordinator} />
          ) : (
            <EmptyState>No classes in this year yet.</EmptyState>
          )
        ) : (
          <TtError>{home.why}</TtError>
        )}
        <p className="bd-phone-note b-muted">Open this on a computer to build.</p>
      </Screen>
    );
  }

  const week = q.week === "B" ? "B" : "A";
  // the check and the rules are read by anyone on the staff list: the builder edits them, a reader (and a phone) sees them as lists
  const [pattern, looks, labels, palette, check, rules] = await Promise.all([
    patternOf(me.email, classId, q.from),
    subjectLooks(),
    headLabels(),
    paletteFor(classId),
    checkOf(me.email, q.from),
    rulesOf(me.email, classId).catch(() => null),
  ]);
  const name = pattern.ok ? `${pattern.data.class.grade} ${pattern.data.class.section}` : "this class";
  return (
    <Screen
      stage="Timetable"
      title={`Build ${name}`}
      purpose="The two-week pattern: each fortnight is made from it."
      next={{ href: "/timetable/build", label: "All classes" }}
    >
      {views}
      {error}
      {pattern.ok ? (
        <Builder
          key={pattern.data.version}
          initial={pattern.data}
          palette={palette}
          rules={rules}
          check={check}
          canWrite={coordinator}
          from={q.from}
          readOnly={
            <>
              <PatternRead pattern={pattern.data} week={week} looks={looks} labels={labels} base={`/timetable/build?class=${classId}${q.from ? `&from=${q.from}` : ""}`} />
              <ReadPanel problems={check.ok ? problemsOf(check.data, classId) : []} rules={rules} />
            </>
          }
        />
      ) : (
        <TtError>{pattern.why}</TtError>
      )}
      <p className="bd-phone-note b-muted">Open this on a computer to build.</p>
    </Screen>
  );
}
