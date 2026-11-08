"""CP-4 phase 1: the list of every table, as child data or school-wide, with the reason for each school-wide table.

Run it against a database built from the migrations *before* the CP-4 migration:

    python packages/engine/tests/support/access_list.py sql  <database url>   # the migration's inserts
    python packages/engine/tests/support/access_list.py note <database url>   # the table for docs/notes/CP-4.md

It refuses to print anything if a table is on neither list, is on both, or is named here and does not exist, so the
migration and this file cannot drift. The rules the choices follow (design.md): a table with a `child_id`, or that hangs
off a paper, a scan or an answer, is child data; a table that only names a class (plan, timetable, materials) holds no
child and is school-wide, as the scope says of plan and timetable.
"""

import sys

import psycopg

# table -> (kind, key column, key type). Kinds are access_kind codes; the three key types after `staff` are CP-4's.
CHILD = {
    # CP-3 (already in the migration of 20270120100000; listed so this file covers every table)
    "pii.child": ("children", "child_id", "child"),
    "public.child": ("children", "id", "child"),
    "public.enrolment": ("enrolment", "class_id", "class"),
    "public.staff": ("staff", "id", "staff"),
    "public.staff_role_grant": ("staff", "staff_id", "staff"),
    "pii.staff": ("staff", "staff_id", "staff"),
    "pii.educator_note": ("notes", "class_id", "class"),
    "pii.note_claim": ("notes", "note_id", "note"),
    # CP-4: a child's own id
    "public.access_log": ("who_looked", "child_id", "child"),
    "public.activity_observation": ("notes", "child_id", "child"),
    "public.child_move": ("children", "child_id", "child"),
    "public.child_observed_state": ("learning", "child_id", "child"),
    "public.child_skill_state": ("learning", "child_id", "child"),
    "public.evidence_event": ("learning", "child_id", "child"),
    "public.child_reading_profile": ("answers", "child_id", "child"),
    "public.gold_finding": ("answers", "child_id", "child"),
    "public.read_correction": ("answers", "child_id", "child"),
    "public.home_sheet": ("papers", "child_id", "child"),
    "public.item_exposure": ("papers", "child_id", "child"),
    "public.paper_edit": ("papers", "child_id", "child"),
    "public.prescription": ("papers", "child_id", "child"),
    "public.parent_note": ("reports", "child_id", "child"),
    "public.consent": ("consent", "child_id", "child"),
    # CP-4: a paper, a scan, an answer (no child column; they hang off the paper)
    "public.sheet_instance": ("papers", "id", "sheet"),
    "public.capture": ("papers", "id", "capture"),
    "public.capture_page": ("papers", "capture_id", "capture"),
    "public.page_choice": ("papers", "capture_id", "capture"),
    "public.item_result": ("answers", "capture_id", "capture"),
    "public.gold": ("answers", "capture_id", "capture"),
    "public.narrative_observation": ("answers", "capture_id", "capture"),
    "public.mistake_named": ("answers", "item_result_id", "item_result"),
    # CP-4: legacy class label (section) with child ids inside
    "public.class_card": ("learning", "section", "section"),
    "public.class_card_confirmation": ("learning", "section", "section"),
}

SCHOOL_WIDE = [
    (
        "the school's structure (years, campuses, classes, days, periods, grades, subjects, roles); no child",
        "academic_year campus school_class school_day fortnight period grade role subject topic domain tenant",
    ),
    (
        "the access rules themselves (CP-3): groups, kinds, reach and the table list; rows about rules, not children",
        "access_group access_kind access_reach access_role_group access_table",
    ),
    (
        "a word list the screens read (names, order, colour of states, marks, routes); no child",
        "approval_kind approval_state case_dimension child_state claim_decision difficulty evidence_kind evidence_mark "
        "evidence_scale link_status link_strength note_status observation_entry_mode observation_outcome "
        "observation_route state_colour validation_stage",
    ),
    (
        "skill registry and curriculum: the school's own teaching content, open to every educator; no child",
        "registry_skill skill skill_level skill_level_kind_change skill_level_kind_stop skill_level_question_type "
        "skill_level_sample skill_level_version skill_link skill_mistake skill_prerequisite skill_registry_link "
        "skill_set_version curriculum_edit curriculum_proposal curriculum_version curriculum_version_skill "
        "learning_objective learning_objective_skill milestone misconception trait rubric level_rule blueprint "
        "validation_rule observed_rule observed_weight question_format question_type question_type_approval",
    ),
    (
        "activities and sample material the school wrote or approved for its curriculum; no child",
        "activity activity_material activity_objective activity_part_source activity_skill passage report_item "
        "taxonomy_case english_sample english_sample_edit english_sample_wrong maths_sample",
    ),
    (
        "the question bank: questions, their keys, checks, statistics and reviews; no child",
        "item item_feedback item_key_change item_registry_skill item_review item_stat key_correction bank_decision "
        "bank_proposal learned_mistake calibration_review assessment_name",
    ),
    (
        "plan and timetable: what a class is to do and when, by class id; no child (the scope names both school-wide)",
        "plan_entry session timetable_block timetable_limit timetable_rule_edit timetable_slot week_declaration "
        "class_skill",
    ),
    (
        "materials lists for the activities of a class and their shopping; by class id; no child",
        "material_alias material_item material_item_proposal material_unit_conversion materials_consolidated "
        "materials_consolidated_change materials_consolidated_line materials_consolidated_send "
        "materials_consolidated_source materials_line materials_line_edit materials_line_source materials_list "
        "materials_note_review materials_send materials_send_ack reminder",
    ),
    (
        "the tool's own records: settings, prompts, runs, errors, feedback notes, approvals, register text; no child",
        "config threshold prompt flow_run web_error staff_note ask approval data_register",
    ),
    (
        "sign-in before anyone is known: the website reads and writes these as the login itself, so they stay open to it",
        "sign_in_failure password_ask password_link",
    ),
    (
        "a blueprint of a paper (its questions and layout), made before any child is named; the register lists it as a "
        "paper but it holds no answer",
        "sheet_template",
    ),
]


def school_wide() -> dict[str, str]:
    out: dict[str, str] = {}
    for reason, names in SCHOOL_WIDE:
        for n in names.split():
            assert n not in out, f"{n} is listed school-wide twice"
            out["public." + n] = reason
    return out


def base_tables(url: str) -> set[str]:
    with psycopg.connect(url) as c:
        return {
            r[0]
            for r in c.execute(
                "select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname in ('public', 'pii') and c.relkind in ('r', 'p')"
            )
        }


def check(tables: set[str]) -> dict[str, str]:
    wide = school_wide()
    both = set(CHILD) & set(wide)
    assert not both, f"on both lists: {sorted(both)}"
    named = set(CHILD) | set(wide)
    # access_table is created by CP-3, so it is a base table here; the CP-4 migration adds no table
    assert not tables - named, f"on neither list: {sorted(tables - named)}"
    assert not named - tables, f"named here but not in the database: {sorted(named - tables)}"
    return wide


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def sql(url: str) -> str:
    wide = check(base_tables(url))
    rows = []
    for t in sorted(CHILD):
        s, n = t.split(".")
        kind, col, typ = CHILD[t]
        rows.append(f"  ({q(s)}, {q(n)}, {q(kind)}, {q(col)}, {q(typ)}, 'child_data', null)")
    for t in sorted(wide):
        s, n = t.split(".")
        rows.append(f"  ({q(s)}, {q(n)}, null, null, null, 'school_wide', {q(wide[t])})")
    return (
        "insert into access_table (schema_name, table_name, kind_code, key_column, key_type, data_class, reason) values\n"
        + ",\n".join(rows)
        + "\non conflict (schema_name, table_name) do update set kind_code = excluded.kind_code,\n"
        "  key_column = excluded.key_column, key_type = excluded.key_type, data_class = excluded.data_class,\n"
        "  reason = excluded.reason;"
    )


def note(url: str) -> str:
    wide = check(base_tables(url))
    out = ["| Table | Class | Kind | Key | Reason |", "|---|---|---|---|---|"]
    for t in sorted(CHILD):
        kind, col, typ = CHILD[t]
        out.append(f"| `{t}` | child data | {kind} | `{col}` ({typ}) | |")
    for t in sorted(wide):
        out.append(f"| `{t}` | school-wide | | | {wide[t]} |")
    return "\n".join(out)


if __name__ == "__main__":
    print({"sql": sql, "note": note}[sys.argv[1]](sys.argv[2]))
