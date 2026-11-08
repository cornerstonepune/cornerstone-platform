"""Direct counts on the database for one fortnight, written by hand, one count(*) per measure: what
`coordinator_counts(fortnight)` must equal (items 5, 6 and 8). Read-only SQL; returns numbers keyed by ids, never a name.

The definitions are today's (`k2_reads._counts`), moved from a week to the fortnight: a day is a date in the school's
`school.time_zone`; a note is one confirmation (`activity_observation.confirmation_id`, corrections left out) placed by
the day it was stored, late when stored on a later day than the activity; class days are weekdays of the fortnight up to
today with no voice note for the class. Report lines and reports belong to the class the child is enrolled in.
"""

MEASURES = ("notes_confirmed", "notes_late", "children_without_notes", "class_days_without_notes", "unplanned",
            "lines_draft", "lines_waiting_second", "lines_approved", "reports_sent")

_PER_CLASS = """
with f as (
  select f.id, f.tenant_id, f.starts_on, f.ends_on,
         coalesce((select value #>> '{}' from config where tenant_id = f.tenant_id and key = 'school.time_zone'),
                  'Asia/Kolkata') as zone
  from fortnight f where f.id = %(f)s
), k as (select c.id from school_class c, f where c.id = any(%(classes)s) and c.tenant_id = f.tenant_id),
line_of as (
  select e.class_id, r.id,
         (select count(*) from approval a where a.kind = 'report_line' and a.target = r.id::text
            and a.decision = 'approved') as yes,
         (select count(*) from approval a where a.kind = 'report_line' and a.target = r.id::text
            and a.decision = 'sent_back') as back
  from report_line r join parent_note n on n.id = r.parent_note_id
  join enrolment e on e.child_id = r.child_id and e.to_date is null, f
  where e.class_id in (select id from k)
    and (n.created_at at time zone f.zone)::date between f.starts_on and f.ends_on
)
select k.id, m.measure, m.n from k, f, lateral (values
  ('notes_confirmed', (select count(distinct o.confirmation_id) from activity_observation o where o.class_id = k.id
     and o.supersedes is null and (o.stored_at at time zone f.zone)::date between f.starts_on and f.ends_on)),
  ('notes_late', (select count(distinct o.confirmation_id) from activity_observation o where o.class_id = k.id
     and o.supersedes is null and (o.stored_at at time zone f.zone)::date between f.starts_on and f.ends_on
     and (o.stored_at at time zone f.zone)::date > (o.observed_at at time zone f.zone)::date)),
  ('children_without_notes', (select count(*) from enrolment e where e.class_id = k.id and e.to_date is null
     and not exists (select 1 from activity_observation o where o.child_id = e.child_id
       and (o.stored_at at time zone f.zone)::date between f.starts_on and f.ends_on))),
  ('class_days_without_notes', (select count(*) from generate_series(f.starts_on,
       least(f.ends_on, (now() at time zone f.zone)::date), '1 day') d
     where extract(isodow from d) < 6 and not exists (select 1 from pii.educator_note n where n.class_id = k.id
       and (n.received_at at time zone f.zone)::date = d::date))),
  ('unplanned', (select count(*) from session s join school_day d on d.id = s.school_day_id
     where s.school_class_id = k.id and d.on_date between f.starts_on and f.ends_on and s.state = 'done'
       and (not s.planned or s.plan_entry_id is null))),
  ('lines_draft', (select count(*) from line_of l where l.class_id = k.id and l.back = 0 and l.yes = 0)),
  ('lines_waiting_second', (select count(*) from line_of l where l.class_id = k.id and l.back = 0 and l.yes = 1)),
  ('lines_approved', (select count(*) from line_of l where l.class_id = k.id and l.back = 0 and l.yes >= 2)),
  ('reports_sent', (select count(*) from parent_note n join enrolment e on e.child_id = n.child_id
     and e.to_date is null where e.class_id = k.id and n.sent_at is not null
     and (n.sent_at at time zone f.zone)::date between f.starts_on and f.ends_on))
) m (measure, n)
"""

_PER_EDUCATOR = """
with f as (
  select f.starts_on, f.ends_on,
         coalesce((select value #>> '{}' from config where tenant_id = f.tenant_id and key = 'school.time_zone'),
                  'Asia/Kolkata') as zone
  from fortnight f where f.id = %(f)s
)
select o.observed_by,
       count(distinct o.confirmation_id) as notes_confirmed,
       count(distinct o.confirmation_id) filter (where (o.stored_at at time zone f.zone)::date
                                                       > (o.observed_at at time zone f.zone)::date) as notes_late
from activity_observation o, f
where o.supersedes is null and o.observed_by = any(%(staff)s)
  and (o.stored_at at time zone f.zone)::date between f.starts_on and f.ends_on
group by o.observed_by
"""


def by_class(c, fortnight, classes) -> dict:
    """{(class_id, measure): n} for the given classes."""
    rows = c.execute(_PER_CLASS, {"f": fortnight, "classes": list(classes)}).fetchall()
    return {(r[0], r[1]): int(r[2]) for r in rows}


def by_educator(c, fortnight, staff) -> dict:
    """{(staff_id, measure): n} for notes_confirmed and notes_late."""
    out = {}
    for who, confirmed, late in c.execute(_PER_EDUCATOR, {"f": fortnight, "staff": list(staff)}).fetchall():
        out[(who, "notes_confirmed")], out[(who, "notes_late")] = int(confirmed), int(late)
    return out


def function_by_class(rows) -> dict:
    """`coordinator_counts` rows (school_class_id, staff_id, measure, n) with no staff id, keyed as `by_class`."""
    return {(r[0], r[2]): r[3] for r in rows if r[1] is None}
