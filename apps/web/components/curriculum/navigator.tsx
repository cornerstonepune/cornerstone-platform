import Link from "@/components/link";
import { SubjectTag } from "@/components/subject-tag";
import { subjectLook, type Looks } from "@/lib/subject-looks";

// Curriculum's three steps (founder, 14 Nov 2026: "a long flat list"): choose a subject (a chip, in its colour and icon), then one of its
// topics (a short list on the left, each with its count), then a skill of it in the table beside. Every choice is the address
// (`?subject=&topic=`), so each state can be linked. A subject's look is the school's own row (`timetable.subject_looks`); one it does
// not list is drawn as arts.
export type NavRow = { subject: string; topic: string };

export function SubjectChips({ rows, subject, href, looks }: { rows: readonly NavRow[]; subject?: string; href: (subject?: string) => string; looks: Looks }) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.subject, (counts.get(r.subject) ?? 0) + 1);
  return (
    <nav aria-label="Subjects" className="mb-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)]">
      <Link href={href()} scroll={false} data-subject-chip="" aria-current={!subject || undefined} className={`btn ${subject ? "secondary" : ""}`}>
        Every subject ({rows.length.toLocaleString("en-IN")})
      </Link>
      {[...counts].map(([s, n]) => (
        <Link key={s} href={href(s)} scroll={false} data-subject-chip={s} aria-current={subject === s || undefined} className={`btn ${subject === s ? "" : "secondary"}`}>
          <SubjectTag look={subjectLook(looks, s)} words={s} /> <span className="b-num">({n.toLocaleString("en-IN")})</span>
        </Link>
      ))}
    </nav>
  );
}

export function TopicList({ rows, topic, href }: { rows: readonly NavRow[]; topic?: string; href: (topic?: string) => string }) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.topic || "Other", (counts.get(r.topic || "Other") ?? 0) + 1);
  const item = (key: string | undefined, words: string, n: number) => (
    <li key={key ?? ""}>
      <Link
        href={href(key)}
        scroll={false}
        data-topic-link={key ?? ""}
        aria-current={topic === key || undefined}
        className={`flex items-center justify-between gap-[var(--space-2)] rounded px-[var(--space-2)] py-[var(--space-1)] ${topic === key ? "font-semibold bg-[var(--surface-2,transparent)]" : ""}`}
      >
        <span className="min-w-0 truncate">{words}</span>
        <span className="b-num b-muted">{n.toLocaleString("en-IN")}</span>
      </Link>
    </li>
  );
  return (
    <nav aria-label="Topics" className="w-full md:w-[14rem] md:shrink-0">
      <ul className="grid gap-[var(--space-1)]">
        {item(undefined, "Every topic", rows.length)}
        {[...counts].map(([t, n]) => item(t, t, n))}
      </ul>
    </nav>
  );
}
