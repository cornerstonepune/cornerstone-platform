import { Screen } from "@/components/app-frame";
import Link from "@/components/link";
import { EmptyState } from "@/components/empty-state";
import { requireStaff } from "@/lib/auth";
import { headLabels, subjectLooks } from "@/lib/subject-looks";
import { buildHome, patternOf } from "@/lib/timetable-build";
import { checkOf } from "@/lib/timetable-check";
import { rulesOf } from "@/lib/timetable-rules";
import { isCoordinator } from "@/lib/timetable-ui";
import "../timetable.css";
import "./build.css";
import { TtError } from "../tt-error";
import { paletteFor } from "@/lib/timetable-palette";
import { PatternRead } from "./grid";
import { Builder } from "./paint";
import { BuildHomeView } from "./home";

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
  // the panel's check and rules are the builder's (a coordinator's); a reader is not sent them
  const [pattern, looks, labels, palette, check, rules] = await Promise.all([
    patternOf(me.email, classId, q.from),
    subjectLooks(),
    headLabels(),
    paletteFor(classId),
    coordinator ? checkOf(me.email, q.from) : ({ ok: false, why: "" } as const),
    coordinator ? rulesOf(me.email, classId).catch(() => null) : null,
  ]);
  const name = pattern.ok ? `${pattern.data.class.grade} ${pattern.data.class.section}` : "this class";
  return (
    <Screen
      stage="Timetable"
      title={`Build ${name}`}
      purpose="The two-week pattern: each fortnight is made from it."
      next={{ href: "/timetable/build", label: "All classes" }}
    >
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
          readOnly={<PatternRead pattern={pattern.data} week={week} looks={looks} labels={labels} base={`/timetable/build?class=${classId}`} />}
        />
      ) : (
        <TtError>{pattern.why}</TtError>
      )}
      <p className="bd-phone-note b-muted">Open this on a computer to build.</p>
    </Screen>
  );
}
