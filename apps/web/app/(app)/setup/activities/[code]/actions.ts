"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { curriculumChanged } from "@/lib/curriculum-cache";
import { mustBeOn } from "@/lib/curriculum-screens";
import { EngineDown, engineSend } from "@/lib/engine";

// Editing a part in the person's own words (CP-48: no queue; CP-53: any part, the school's words included). The engine records the part
// as the person's, so a reload from the sheet never writes over it.
// The page the edit was made on is drawn again: the curriculum workspace with the activity open, or the activity's own page.
const OURS = /^\/setup\/(curriculum|activities\/)\S*$/;

/** Her own words: the steps one a line; how to think as an idea line and slips, each "keyword: how to see it". */
export async function edit(f: FormData): Promise<void> {
  const me = await requireStaff();
  const code = String(f.get("code") ?? "");
  const part = String(f.get("part") ?? "");
  const lines = (k: string) => String(f.get(k) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const kind = String(f.get("kind") ?? "text");
  const words =
    kind === "bullets"
      ? { items: lines("items") }
      : kind === "thinking"
        ? {
            idea: String(f.get("idea") ?? "").trim(),
            slips: lines("slips").map((l) => {
              const cut = l.indexOf(":");
              return cut > 0 ? { keyword: l.slice(0, cut).trim(), spot: l.slice(cut + 1).trim() } : { keyword: l, spot: "" };
            }),
          }
        : { text: String(f.get("text") ?? "").trim() };
  const res = await engineSend("/curriculum/page/edit", { actor: me.email, code, part, ...words } as never);
  if (!res.ok && res.status !== 409) throw new EngineDown(`The engine refused that (${res.status}).`);
  revalidatePath(`/setup/activities/${code}`);
  revalidatePath("/setup/curriculum");
  curriculumChanged();
  const back = String(f.get("back") ?? "");
  if (OURS.test(back)) redirect(back);
}

/** The four levels of How to mark saved together (the activity page's one Edit for the section): each level whose words changed is edited as a part. */
export async function saveLevels(f: FormData): Promise<void> {
  const me = await requireStaff();
  const code = String(f.get("code") ?? "");
  for (let n = 0; n < 4; n++) {
    const text = String(f.get(`level_${n}`) ?? "").trim();
    if (text === String(f.get(`was_${n}`) ?? "").trim()) continue;
    const res = await engineSend("/curriculum/page/edit", { actor: me.email, code, part: `level_${n}`, text } as never);
    if (!res.ok && res.status !== 409) throw new EngineDown(`The engine refused that (${res.status}).`);
  }
  revalidatePath(`/setup/activities/${code}`);
  revalidatePath("/setup/curriculum");
  curriculumChanged();
  const back = String(f.get("back") ?? "");
  if (OURS.test(back)) redirect(back);
}

/** The materials as a list (CP-53): a name and a count a row; a row left with no name goes. The engine refuses a count under 1. */
export async function setMaterials(f: FormData): Promise<void> {
  const me = await requireStaff();
  const code = String(f.get("code") ?? "");
  const names = f.getAll("name").map((v) => String(v).trim());
  const counts = f.getAll("count").map((v) => String(v).trim());
  const items = names.flatMap((name, i) => (name ? [{ name, quantity: counts[i] ? Number(counts[i]) : null }] : []));
  const res = await engineSend("/curriculum/page/materials", { actor: me.email, code, items } as never);
  if (!res.ok && res.status !== 422) throw new EngineDown(`The engine refused that (${res.status}).`);
  revalidatePath(`/setup/activities/${code}`);
  revalidatePath("/setup/curriculum");
  curriculumChanged();
  const back = String(f.get("back") ?? "");
  if (OURS.test(back)) redirect(back);
}

// CP-70 (specs/CP-70/spec.md): a coordinator edits the activity itself where it is shown: its name, the grades it is tagged to, the objectives
// and skills it is tied to, and takes one change back. The engine decides who may (coordinators only), writes the history and refuses in a
// sentence; each action tells the kept reads (`curriculumChanged`), so Curriculum shows the change at once, and comes back to the page.
const CODE = /^[A-Za-z0-9._#-]+$/;
const GRADE = /^[A-Za-z0-9]{1,4}$/;
const LINKS = { skill: "activity_skill", objective: "activity_objective" } as const;

/** Back to the activity's page; what the engine refused, in its own sentence, rides along as `said`. */
async function done(f: FormData, res: Response | null): Promise<never> {
  const code = String(f.get("code") ?? "");
  const given = String(f.get("back") ?? "");
  const [path, query = ""] = (OURS.test(given) ? given : `/setup/activities/${encodeURIComponent(code)}`).split("#")[0].split("?");
  const q = new URLSearchParams(query);
  q.delete("said");
  if (res && !res.ok) {
    if (res.status >= 500) throw new EngineDown(`The engine refused that (${res.status}). Nothing was changed.`);
    const detail = ((await res.json().catch(() => null)) as { detail?: unknown } | null)?.detail;
    q.set("said", typeof detail === "string" ? detail : "That was not saved.");
  }
  revalidatePath(`/setup/activities/${code}`);
  revalidatePath("/setup/curriculum");
  curriculumChanged();
  const at = String(f.get("at") ?? "");
  redirect(`${path}${q.size ? `?${q}` : ""}${/^[\w-]+$/.test(at) ? `#${at}` : ""}`);
}

/** The activity's name. */
export async function rename(f: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const code = String(f.get("code") ?? "");
  const ok = CODE.test(code);
  return done(f, ok ? await engineSend("/curriculum/edit/activity", { actor: me.email, code, changes: { name: String(f.get("name") ?? "") } }) : null);
}

/** Tag the activity to one more grade, or take it out of one. The engine keeps at least one grade on it. */
export async function changeGrade(f: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const code = String(f.get("code") ?? "");
  const grade = String(f.get("grade") ?? "");
  const path = f.get("do") === "remove" ? "/curriculum/edit/grade/remove" : "/curriculum/edit/grade/add";
  return done(f, CODE.test(code) && GRADE.test(grade) ? await engineSend(path, { actor: me.email, kind: "activity", code, grade }) : null);
}

/** Tie the activity to a skill or an objective, or untie it. Only the tie changes; the skill and the objective stay. */
export async function changeTie(f: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const code = String(f.get("code") ?? "");
  const other = String(f.get("other") ?? "");
  const table = LINKS[f.get("kind") === "skill" ? "skill" : "objective"];
  const path = f.get("do") === "remove" ? "/curriculum/edit/unlink" : "/curriculum/edit/link";
  return done(f, CODE.test(code) && CODE.test(other) ? await engineSend(path, { actor: me.email, table, one: code, other }) : null);
}

/** Take one change back. It is a new change in the history; nothing is erased. */
export async function undo(f: FormData): Promise<void> {
  const me = await requireStaff();
  await mustBeOn(me.email);
  const id = String(f.get("change") ?? "");
  return done(f, /^[0-9a-f-]{36}$/.test(id) ? await engineSend("/curriculum/edit/undo", { actor: me.email, change_id: id }) : null);
}
