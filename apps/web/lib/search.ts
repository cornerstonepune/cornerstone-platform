import { sql } from "./db";
import type { Session } from "./auth";
import { seesClass, seesSheet } from "./reach";
import { grades } from "./queries";
import { weekWords } from "./week";
import { weekSql } from "./queries-papers";

// The search in the bar (goals/s1-subject-class-and-today.yaml, docs/frontend/screens.json `bar`): a typeahead, not a page of
// results. It finds a child, an assessment or a paper code, and offers at most five. What is typed is posted (app/api/search),
// never put in an address and never logged: a child's name never goes into an address, and an address is what a server logs
// (goals/ui4a-staff-and-search.yaml). Only what the person sees is searched (`staff_sees`, goals/own_who_sees_answers.yaml),
// chosen before any name is read; names are read through pii.read_child, which logs who asked.

export type Hit = { label: string; href: string };

export const MOST_SUGGESTIONS = 5;

export async function suggest(me: Session, typed: string): Promise<Hit[]> {
  const q = typed.trim().slice(0, 80);
  if (!q) return [];
  const g = await grades();
  const said = (band: string, section: string) => `${g.name(band)} · ${section}`;
  const [papers, children, assessments] = await Promise.all([
    // a paper by its printed code (CS and six hex), as the page it is printed on
    /^cs[0-9a-f]{6}$/i.test(q)
      ? sql<{ qr: string }[]>`select qr_code as qr from sheet_instance where upper(qr_code) = upper(${q}) and print_status <> 'void' and ${seesSheet(me, sql`id`)}`
      : Promise.resolve([]),
    // a child by part of their name, or by Sr. No. (roll number), within the classes the person sees
    sql<{ id: string; name: string; band: string; section: string; roll_no: string }[]>`
      select c.id, n.first_name as name, class_band(c.tenant_id, c.section) as band, c.section, c.roll_no
      from child_now c, lateral pii.read_child(c.id, ${me.email}) n
      where c.active and ${seesClass(me, sql`c.section`)} and (${/^\d+$/.test(q)} and c.roll_no = ${q}
                          or position(lower(${q}) in lower(n.first_name || ' ' || n.last_name)) > 0)
      order by c.section, roll_order(c.roll_no), c.roll_no limit ${MOST_SUGGESTIONS}`,
    // an assessment — a class paper given in a week — by the skill or the title it tests, as Assessments lists it
    sql<{ name: string; kind: string; section: string; band: string; week: string | null; set: string }[]>`
      select coalesce(ss.name, t.key ->> 'title', t.code) as name, si.kind, si.section, class_band(si.tenant_id, si.section) as band,
             ${weekSql("si", "t")} as week, coalesce(t.skill_set_code, t.id::text) as set
      from sheet_instance si join sheet_template t on t.id = si.sheet_template_id
      left join skill ss on ss.tenant_id = t.tenant_id and ss.code = t.skill_set_code
      where si.print_status <> 'void' and si.kind in ('practice', 'assessment') and si.section is not null
        and ${seesSheet(me, sql`si.id`)}
        and position(lower(${q}) in lower(coalesce(ss.name, t.key ->> 'title', t.code))) > 0
      group by 1, 2, 3, 4, 5, 6 order by max(si.created_at) desc limit ${MOST_SUGGESTIONS}`,
  ]);
  const hits: Hit[] = [
    ...papers.map((p) => ({ label: `Paper ${p.qr}`, href: `/worksheets/${p.qr}` })),
    ...children.map((c) => ({ label: `${c.name} · ${said(c.band, c.section)} · Sr. No. ${c.roll_no}`, href: `/growth/${c.id}` })),
    ...assessments.map((a) => {
      const to = new URLSearchParams({ class: a.section, kind: a.kind, set: a.set, ...(a.week ? { week: a.week } : {}) });
      return { label: `Assessment · ${a.name} · ${said(a.band, a.section)} · ${weekWords(a.week)}`, href: `/papers?${to}` };
    }),
  ];
  return hits.slice(0, MOST_SUGGESTIONS);
}
