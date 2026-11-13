import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { DetailPanel } from "@/components/detail-panel";
import { PeekHost } from "@/components/peek-names";
import { requireStaff } from "@/lib/auth";
import { noteEdges, noteOf, noteOpened } from "../note-panel";

// Confirm what the reader heard (UI-3a), one note a screen: the note the Notes list opens on its right (page charter Part C, "Notes / A
// note"), opened full page at its own address so it can be linked. Tabs Marks (the reader's problems pinned in red, her words beside the
// class already marked from them, Confirm for this note only; a confirmed note's Correct this note) · Children (the children it names).
// Its next step is the next note waiting, or Notes.
export default async function ConfirmWhatTheReaderHeard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const me = await requireStaff();
  const n = await noteOf(me, id);
  if (!n) notFound();
  return (
    <PeekHost>
      <Screen
        stage={`${n.klass} · note of ${n.heard}${n.draft.activity ? ` · ${n.names[n.draft.activity] ?? ""}` : ""}`}
        title="Confirm what the reader heard"
        purpose="Left, your words line by line. Right, the class marked from them. Nothing is ticked for you. Confirm is for this note only."
        action={
          <Link href={`/notes?${new URLSearchParams({ open: `note:${id}` })}`} className="btn secondary">
            All notes
          </Link>
        }
        next={{ href: "/notes", label: "Notes" }}
        rail={<Rail edges={noteEdges(n)} />}
      >
        <DetailPanel inline open={noteOpened(n, { tab })} summary={{ title: "", stats: [] }} />
      </Screen>
    </PeekHost>
  );
}
