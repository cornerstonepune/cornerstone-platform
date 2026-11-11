// The coordinator's timetable writes (UI-6): the fortnight's next step, a draft, linking plan lines, a move by hand and accepting a
// clash. One form post each. The engine's plan routes only check that the actor is on the staff list, so `coordinatorOnly`
// checks the coordinator group first and answers 403 to anyone else without calling the engine. Nothing is decided here:
// the engine's own refusal comes back in the address, in its own words.
import { currentStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EngineDown, engineSend } from "@/lib/engine";
import { backTo, coordinatorOnly } from "@/lib/timetable-guard";
import { refusal } from "@/lib/timetable-ui";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : "";
};
const num = (f: FormData, k: string) => Number(text(f, k));

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const who = await coordinatorOnly(await currentStaff());
  if ("refused" in who) return who.refused;
  const f = await request.formData();
  if (action === "golive") return goLive(f, who.me.email);
  const back = text(f, "back") || "/timetable";
  if (!back.startsWith("/timetable")) return new Response("not a place to go back to", { status: 400 });
  const actor = who.me.email;
  let res: Response;
  try {
    switch (action) {
      case "fortnight":
        res = await engineSend("/fortnight/move", { actor, fortnight_id: text(f, "fortnight_id"), to_state: text(f, "to_state") });
        break;
      case "generate": {
        // one draft for every class of the year (the engine makes one class at a time); the first refusal is the answer
        const classes = await sql<{ grade: string; section: string }[]>`select distinct c.grade_code as grade, c.section from school_class c join academic_year y on y.id = c.academic_year_id where y.label = ${text(f, "year")} order by 1, 2`;
        res = new Response(null, { status: 200 });
        for (const c of classes) {
          res = await engineSend("/timetable/generate", { actor, grade: c.grade, section: c.section, year: text(f, "year"), fortnight: num(f, "fortnight") });
          if (!res.ok) break;
        }
        break;
      }
      case "link":
        res = await engineSend("/timetable/link", { actor, fortnight: num(f, "fortnight") || null, apply: text(f, "apply") === "1" });
        break;
      case "move":
        res = await engineSend("/timetable/move", {
          actor, grade: text(f, "grade"), section: text(f, "section"), year: text(f, "year"),
          from_date: text(f, "from_date"), from_period: num(f, "from_period"), to_date: text(f, "to_date"), to_period: num(f, "to_period"),
          reason: text(f, "reason") || null,
        });
        break;
      case "clash":
        if (!text(f, "reason")) return backTo(request, back, { error: "Say why" });
        res = await engineSend("/timetable/clash/accept", { actor, key: text(f, "key"), reason: text(f, "reason") });
        break;
      default:
        return new Response("no such action", { status: 404 });
    }
  } catch (e) {
    if (e instanceof EngineDown) return backTo(request, back, { error: e.message });
    throw e;
  }
  if (!res.ok) return backTo(request, back, { error: await refusal(res, "That was not done.") });
  return backTo(request, back, { done: action });
}

// Go live puts every class's newest placed draft live for one fortnight (the engine does one class at a time: `/timetable/go-live`)
// and answers what each changed, so the fortnight page can list every session. A class whose draft the engine refuses is named with
// the engine's own words; the others still go. Nothing is stored here: the engine's report is the answer.
async function goLive(f: FormData, actor: string): Promise<Response> {
  const number = num(f, "fortnight");
  const [year] = await sql<{ year: string }[]>`
    select y.label as year from fortnight n join academic_year y on y.id = n.academic_year_id where n.number = ${number} and n.kind = 'teaching' limit 1`;
  if (!year) return Response.json({ error: "That is not a teaching fortnight." }, { status: 404 });
  const classes = await sql<{ grade: string; section: string; label: string }[]>`
    select distinct c.grade_code as grade, c.section, c.label from timetable_run r
    join fortnight n on n.id = r.fortnight_id join school_class c on c.id = r.school_class_id
    where n.number = ${number} and r.outcome = 'placed' order by c.label`;
  if (!classes.length) return Response.json({ error: "No class has a placed draft for this fortnight." }, { status: 409 });
  const reports: { class: string; report: unknown }[] = [];
  const refused: { class: string; error: string }[] = [];
  try {
    for (const c of classes) {
      const res = await engineSend("/timetable/go-live", { actor, grade: c.grade, section: c.section, year: year.year, fortnight: number, reason: text(f, "reason") || null });
      if (res.ok) reports.push({ class: c.label, report: await res.json() });
      else refused.push({ class: c.label, error: await refusal(res, "That was not done.") });
    }
  } catch (e) {
    if (e instanceof EngineDown) return Response.json({ error: e.message }, { status: 503 });
    throw e;
  }
  return Response.json({ reports, refused }, { status: reports.length ? 200 : 409 });
}
