import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { schoolZone } from "@/lib/school-clock";
import { classWords } from "@/lib/voice-types";
import { Icon } from "@/lib/icons";
import { draftOf } from "@/lib/voice";
import { herVoice } from "@/lib/voice-page";
import { W } from "@/lib/voice-words";
import { Body, Late } from "./parts";

// Confirm one note (task M1-04): what she said on the left, line by line beside its words; the class's children on the
// right, already marked from it; the red problems pinned on top. One note a screen, its own Confirm, never one over all.
const UUID = /^[0-9a-f-]{36}$/;

export default async function ConfirmNote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireStaff();
  const my = await herVoice(me);
  const draft = await draftOf(me, id);
  if (!draft) notFound();
  const queued = my.notes.find((n) => n.id === id);
  const c = my.classes.find((x) => x.id === queued?.class_id);
  const klass = c ? classWords(c) : "";
  const form = { href: c ? `/voice/form?class=${c.id}` : "/voice/form", label: W.fillForm };
  const zone = await schoolZone();
  const heard = new Date(draft.received_at).toLocaleString("en-IN", { timeZone: zone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <Screen
      stage={W.back}
      title={W.confirm.title}
      purpose={W.confirm.purpose}
      action={
        <Link href={form.href} className="btn secondary inline-flex items-center gap-1.5">
          <Icon name="form" />
          {W.useForm}
        </Link>
      }
      next={{ href: "/today?open=notes", label: W.groups.notes }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px]" data-note-head>
        <span className="font-medium">{klass}</span>
        <span className="text-basalt/70">{heard}</span>
        <Late draft={draft} zone={zone} />
        {my.recording ? <audio controls preload="none" src={`/api/voice/${id}`} aria-label={W.confirm.play} className="h-9 max-w-full" /> : null}
      </div>
      <Body draft={draft} klass={klass} grade={c?.grade} form={form} />
    </Screen>
  );
}

