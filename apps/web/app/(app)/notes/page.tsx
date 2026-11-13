import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KanbanBoard, ViewToggle, type KCard } from "@/components/kanban-board";
import { PeekChip, PeekHost } from "@/components/peek-names";
import { Screen } from "@/components/app-frame";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { activityNames, childrenByIds, classNotes, coordinatorNotes, type ClassNote } from "@/lib/notes-loop";
import { schoolToday, schoolZone } from "@/lib/school-clock";
import { notFound } from "next/navigation";
import { voiceOn } from "@/lib/voice";
import { herVoice } from "@/lib/voice-page";
import { classWords } from "@/lib/voice-types";
import { pageOf } from "@/lib/ux-rules";
import { noteOf, noteOpened, noteTitle, OpenNote } from "./note-panel";

// Notes (UI-3a; page charter Part C, "Notes / A note": a Workspace). On the left every note of her classes, waiting, confirmed and left
// unconfirmed, as rows or lanes; choosing one opens it on the right (`?open=note:<id>&tab=`), its marks to confirm, or (a confirmed one) to
// correct, without leaving the list; its own address (/notes/<id>) is the same panel opened full page. With nothing chosen the right side
// counts the notes by state. The notes are the engine's (POST /voice/class-notes): her own notes of a class she holds, one day at a time, so
// the week she chose is read a day at a time. A coordinator reads every class's notes and opens none: a note is read for its author only.
const WEEKS = { fortnight: ["This fortnight", 14], week: ["This week", 7], last: ["Last week", 7] } as const;
type Week = keyof typeof WEEKS;
const STATES: Record<string, string> = { to_confirm: "To confirm", confirmed: "Confirmed", unconfirmed: "Unconfirmed" };
const day = (iso: string, back: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);

type Row = ClassNote & { klass: string; class_id: string };
type Q = { class?: string; state?: string; week?: string; view?: string; page?: string; open?: string; tab?: string };
const chipOf = (n: ClassNote): { state: State; words: string } =>
  n.state === "confirmed" ? { state: "done", words: "Confirmed" }
  : n.state === "left_unconfirmed" ? { state: "late", words: "Late" }
  : n.state === "being_read" ? { state: "reading", words: "Reading your note" }
  : n.state === "fix_this" ? { state: "fixThis", words: "Fix this" }
  : { state: "toConfirm", words: "To confirm" };
const group = (n: ClassNote) => (n.state === "confirmed" ? "confirmed" : n.state === "left_unconfirmed" ? "unconfirmed" : "to_confirm");

export default async function Notes({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  // a coordinator reads every class of the campus (the engine's coordinator list); an educator her own classes
  const coord = me.role === "coordinator";
  if (coord && !(await voiceOn())) notFound();
  const my = coord ? { classes: [] as { id: string; grade: string; section: string }[], notes: [], recording: false } : await herVoice(me);
  const q = await searchParams;
  const week: Week = q.week && q.week in WEEKS ? (q.week as Week) : "fortnight";
  const state = q.state && q.state in STATES ? q.state : undefined;
  const view = q.view === "table" || coord ? "table" : "board";
  const classes = q.class ? my.classes.filter((c) => c.id === q.class) : my.classes;
  const [today, zone] = await Promise.all([schoolToday(), schoolZone()]);
  const [span, skip] = [WEEKS[week][1], week === "last" ? 7 : 0];
  const days = Array.from({ length: span }, (_, i) => day(today, i + skip));
  const got = coord
    ? await Promise.all(days.map(async (d) => ((await coordinatorNotes(me, d))?.notes ?? []).map((n): Row => ({ ...n, klass: n.class ?? "", class_id: n.class_id ?? "" }))))
    : await Promise.all(classes.flatMap((c) => days.map(async (d) => ((await classNotes(me, c.id, d))?.notes ?? []).map((n): Row => ({ ...n, klass: classWords(c), class_id: c.id })))));
  const everyClass = coord ? [...new Map(got.flat().map((n) => [n.class_id, n.klass])).entries()] : my.classes.map((c) => [c.id, classWords(c)] as const);
  // late ones first, then the oldest waiting, then the confirmed, newest first
  const rank = (n: Row) => (n.state === "left_unconfirmed" ? 0 : n.state === "confirmed" ? 2 : 1);
  const all = got.flat().filter((n) => (!state || group(n) === state) && (!q.class || n.class_id === q.class)).sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.received_at.localeCompare(a.received_at) : a.received_at.localeCompare(b.received_at)));
  const kids = await childrenByIds(me, [...new Set(all.flatMap((n) => n.children))]);
  const names = await activityNames(all.flatMap((n) => (n.activity ? [n.activity] : [])));
  // the list's own address: its filters, view and page; `open`/`tab` name the note shown on the right
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q.class ? { class: q.class } : {}), ...(state ? { state } : {}), ...(q.week ? { week } : {}), ...(view === "table" ? { view } : {}), ...(q.page ? { page: q.page } : {}), ...extra });
    return `/notes${p.size ? `?${p}` : ""}`;
  };
  const openHref = (id: string) => href({ open: `note:${id}` });
  // the note chosen: one of her own (a coordinator opens none, as the engine reads a draft for its author only)
  const opened = parseOpen(q.open);
  const chosen = !coord && opened?.kind === "note" ? await noteOf(me, opened.id) : null;
  const oldest = all.find((n) => n.state === "to_confirm" || n.state === "fix_this");
  const title = (n: Row) => noteTitle(n, names);
  const when = (n: Row) => new Date(n.received_at).toLocaleString("en-IN", { timeZone: zone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const named = (n: Row) => `${n.children.length} ${n.children.length === 1 ? "child" : "children"} named`;
  const card = (n: Row): KCard => ({ key: n.note_id, kind: "note", title: title(n), sub: `${n.typed ? "Form" : "Voice note"} · ${named(n)} · ${n.klass}`, href: openHref(n.note_id), openKey: `note:${n.note_id}`, selected: chosen?.id === n.note_id, state: chipOf(n).state });
  const lane = (key: string, label: string, state: State, rows: Row[]) => ({ key, label, state, count: rows.length, empty: "Nothing here", cards: rows.map(card) });
  const waiting = all.filter((n) => group(n) !== "confirmed");
  const done = all.filter((n) => group(n) === "confirmed");
  const paged = pageOf(all, Number(q.page) || 1);
  const kid = (id: string) => kids[id];
  const count = (k: string) => all.filter((n) => group(n) === k).length;
  return (
    <PeekHost>
      <Screen
        stage={`${everyClass.length === 1 ? everyClass[0][1] : coord ? "Every class" : "Your classes"} · ${WEEKS[week][0].toLowerCase()}`}
        title="Notes"
        purpose="Every note of your classes: waiting, confirmed, left unconfirmed. Choose one to confirm its marks, or to correct a confirmed one."
        action={
          coord ? (
            <Link href="/today" className="btn secondary">
              Back to Today
            </Link>
          ) : oldest ? (
            <Link href={openHref(oldest.note_id)} scroll={false} className="btn">
              Confirm the oldest
            </Link>
          ) : (
            <Link href="/today" className="btn">
              Record on a lesson
            </Link>
          )
        }
        next={{ href: "/today", label: "Today" }}
        panel={
          <DetailPanel
            open={chosen ? noteOpened(chosen, { tab: q.tab, closeHref: href({}), full: `/notes/${chosen.id}`, panel: true }) : null}
            summary={{
              title: "Notes by state",
              stats: [
                { id: "to_confirm", n: count("to_confirm"), line: "to confirm", tone: "wait" },
                { id: "unconfirmed", n: count("unconfirmed"), line: "left unconfirmed", tone: "act" },
                { id: "confirmed", n: count("confirmed"), line: "confirmed", tone: "ok" },
                { id: "typed", n: all.filter((n) => n.typed).length, line: "typed by form", tone: "quiet" },
              ],
              after: (
                <>
                  {everyClass.length > 1 ? (
                    <ul className="grid gap-1 text-[13px]" data-summary="class">
                      {everyClass.map(([id, words]) => (
                        <li key={id}>
                          {words} · {all.filter((n) => n.class_id === id).length} {all.filter((n) => n.class_id === id).length === 1 ? "note" : "notes"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="b-label b-muted">{coord ? "Every class's notes, to read. The educator who wrote a note confirms it." : "Choose a note to see its marks here."}</p>
                </>
              ),
            }}
          />
        }
      >
        <FilterBar
          action="/notes"
          keep={{ view: view === "table" ? "table" : undefined }}
          filters={[
            ...(everyClass.length > 1 ? [{ name: "class", label: "Class", value: q.class, all: "All classes", options: everyClass.map(([id, words]) => [id, words] as const) }] : []),
            { name: "state", label: "State", value: state, all: "All", options: Object.entries(STATES) },
            { name: "week", label: "Week", value: q.week ? week : undefined, all: "This fortnight", options: Object.entries(WEEKS).map(([k, v]) => [k, v[0]] as const) },
          ]}
        />
        {coord ? null : (
          <div className="mb-3">
            <ViewToggle current={view} views={[{ key: "table", label: "Table", icon: "table", href: viewHref(q, "table") }, { key: "board", label: "Board", icon: "board", href: viewHref(q, "board") }]} />
          </div>
        )}
        {all.length === 0 ? (
          <EmptyState next={coord ? undefined : { href: "/today", label: "Record on a lesson" }}>No notes yet this fortnight.</EmptyState>
        ) : view === "board" ? (
          <KanbanBoard lanes={[lane("to_confirm", "To confirm", "toConfirm", waiting), lane("confirmed", "Confirmed", "done", done)]} />
        ) : (
          <DataTable
            label="Notes"
            rows={paged.rows}
            rowKey={(n) => n.note_id}
            more={{ page: paged.page, href: (p: number) => href({ page: String(p) }), of: all.length }}
            extras={{ attrs: (n): Record<string, string> => (chosen?.id === n.note_id ? { "data-selected": "" } : {}) }}
            columns={[
              { key: "when", label: "When", value: when },
              { key: "activity", label: "Activity", value: title, cell: (n) => (<><span>{title(n)}</span><br /><span className="muted">{n.klass}</span></>) },
              { key: "by", label: "By", value: (n) => (n.typed ? "form" : "voice") },
              { key: "state", label: "State", status: true, value: (n) => chipOf(n).words, cell: (n) => <StatusChip state={chipOf(n).state} words={chipOf(n).words} round /> },
              {
                key: "children",
                label: "Children named",
                value: (n) => n.children.length,
                cell: (n) => (
                  <ul className="b-nchips">
                    {n.children.slice(0, 2).flatMap((id) => (kid(id) ? [<li key={id}><PeekChip kid={{ ...kid(id), href: `/children/${kid(id).classId}/${Number(kid(id).no)}`, classId: kid(id).classId, roll: String(Number(kid(id).no)) }} /></li>] : []))}
                    {n.children.length > 2 ? <li className="muted">+{n.children.length - 2} more</li> : null}
                  </ul>
                ),
              },
              { key: "next", label: "Next", status: true, keep: true, value: (n) => n.state, cell: (n) => (coord ? <span className="muted">Read only</span> : <OpenNote href={openHref(n.note_id)} id={n.note_id} className="btn">{n.state === "confirmed" ? "Open" : n.state === "being_read" ? "Reading" : "Confirm"}</OpenNote>) },
            ]}
          />
        )}
      </Screen>
    </PeekHost>
  );
}

/** The address of the other view: the filters kept, the page and the note chosen left behind. */
function viewHref(q: Q, view: "table" | "board") {
  const p = new URLSearchParams();
  for (const k of ["class", "state", "week"] as const) {
    const v = q[k];
    if (v) p.set(k, v);
  }
  if (view === "table") p.set("view", "table");
  return `/notes${p.size ? `?${p}` : ""}`;
}
