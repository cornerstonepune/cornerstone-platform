import { sql } from "./db";
import { headLabels, subjectLook, subjectLooks, type Look } from "./subject-looks";

// What a coordinator may paint a class's lesson with (CP-71). The school's own rows decide: the heads (`timetable.heads`), their colours
// (`timetable.subject_looks`) and which heads are a specialist's (`timetable.vocabulary`). A grade offers the heads its classes already use;
// a grade none of whose classes has a pattern yet offers the subject table's heads (spec S1: a Grade 1 to 4 head is the subject's code).
// No subject is named in this file.
export type Head = { code: string; label: string; look: Look; cell: "subject" | "specialist" };

export async function paletteFor(classId: string): Promise<Head[]> {
  const [labels, looks] = await Promise.all([headLabels(), subjectLooks()]);
  const [voc] = await sql<{ specialist: string[] }[]>`select value->'specialist' as specialist from config where key = 'timetable.vocabulary'`;
  const [extra] = await sql<{ value: string[] }[]>`select value from config where key = 'timetable.specialists'`;
  const special = new Set([...(Array.isArray(voc?.specialist) ? voc.specialist : []), ...(Array.isArray(extra?.value) ? extra.value : [])]);
  const used = new Set(
    (
      await sql<{ code: string }[]>`
        select distinct r.subject_code as code from timetable_rule r join school_class c on c.id = r.school_class_id
        where r.kind = 'frame' and r.subject_code is not null
          and c.grade_code = (select grade_code from school_class where id = ${classId})`
    ).map((r) => r.code),
  );
  const subjects = new Set((await sql<{ code: string }[]>`select code from subject`).map((r) => r.code));
  // a grade that teaches by subject code offers every subject of the school's list; K2's own heads are the ones its classes use
  const bySubject = used.size === 0 || [...used].some((c) => subjects.has(c));
  // the school's order is the order of its heads row
  return [...labels]
    .filter(([code]) => used.has(code) || (bySubject && subjects.has(code)))
    .map(([code, label]): Head => ({ code, label, look: subjectLook(looks, code), cell: special.has(code) ? "specialist" : "subject" }));
}
