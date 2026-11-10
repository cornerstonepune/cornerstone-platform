"""A coordinator changes a child's grade, or moves them to another class (goals/mov_move_a_child.yaml).

Nimish, 27 Oct 2026, asked for a child to be moved to Grade 4 and wanted the data "in a structured way. It's not like some
hard-coded backend". The change is one database function, `move_child`, that changes the child's grade and their
enrolment (CP-27 group 4: a child's class and roll live there alone; one closed, one opened) together with one row of the
history log, `change_log`, and brings what depends on the child's grade or class up to date. No child's name is anywhere
in this file (rule 6): the children are made here, in a transaction rolled back at the end.
"""

import os
import uuid

import pytest

from engine.core import db, roster, weeks
from engine.w4_close import card
from tests import rows
from tests.rows import a_child_in

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
FUTURE, PAST = (
    weeks.day("2099-W10"),
    weeks.day("2020-W01"),
)  # a week still to come, one long gone (a date: CP-27)


@pytest.fixture
def conn():
    with db.connect() as c:
        yield c
        c.rollback()


def _class(conn, bands):
    """A class of the test's own, this school year, one child per band in the order given, rolls 1 up →
    (section, [child ids]). The class takes the grade of its first child."""
    section = f"MOV-{uuid.uuid4().hex[:8].upper()}"
    t = rows.tenant(conn)
    ids = [a_child_in(conn, section, band, str(roll), t) for roll, band in enumerate(bands, 1)]
    return section, ids


def _move(conn, child, band, section, roll, by="coordinator@cornerstone.test", reason=""):
    return conn.execute(
        "select move_child(%s, %s, %s, %s, %s, %s) as r", (child, band, section, roll, by, reason)
    ).fetchone()["r"]


def _row(conn, child):
    return conn.execute("select band, section, roll_no from child_now where id = %s", (child,)).fetchone()


def _history(conn, child):
    """Each move of the child as the history log keeps it: from and to (grade, class, roll), who, why and when."""
    return conn.execute(
        "select before ->> 'band' as from_band, before ->> 'section' as from_section, before ->> 'roll_no' as from_roll_no,"
        " after ->> 'band' as to_band, after ->> 'section' as to_section, after ->> 'roll_no' as to_roll_no,"
        " staff_id, origin, reason, at from change_log where table_name = 'child' and op = 'move' and row_id = %s"
        " order by at",
        (str(child),),
    ).fetchall()


def test_a_grade_change_keeps_the_child_in_their_class_and_writes_one_history_row(conn):
    section, (child,) = _class(conn, ["G3"])
    said = _move(conn, child, "G4", section, "1", reason="ready for the next grade")
    assert said["moved"] is True
    assert _row(conn, child) == {"band": "G4", "section": section, "roll_no": "1"}
    [h] = _history(conn, child)
    assert (h["from_band"], h["from_section"], h["from_roll_no"]) == ("G3", section, "1")
    assert (h["to_band"], h["to_section"], h["to_roll_no"]) == ("G4", section, "1")
    assert h["origin"] == "coordinator@cornerstone.test" and h["reason"] == "ready for the next grade"
    assert h["at"] is not None and h["staff_id"] is None, "a mover who is no member of staff is kept as given"


def test_a_move_keeps_the_same_child_id_so_every_answer_stays_with_them(conn):
    paper = rows.a_read_paper(conn, [{"status": "correct", "read": "12", "state": "confirmed"}])
    child = paper["child"]
    there, _ = _class(conn, ["G4", "G4"])
    before = conn.execute("select count(*) as n from child").fetchone()["n"]
    said = _move(conn, child, "G4", there, "12")
    assert said["moved"] is True
    assert conn.execute("select count(*) as n from child").fetchone()["n"] == before, (
        "no second child is made"
    )
    assert _row(conn, child) == {"band": "G4", "section": there, "roll_no": "12"}
    held = conn.execute(
        "select count(*) as n from item_result r join capture c on c.id = r.capture_id"
        " join sheet_instance s on s.id = c.sheet_instance_id where s.child_id = %s",
        (child,),
    ).fetchone()["n"]
    assert held == len(paper["results"]), "the child's results still belong to the same child"
    assert [h["to_roll_no"] for h in _history(conn, child)] == ["12"]


def test_a_taken_roll_number_says_so_and_changes_nothing(conn):
    here, (child,) = _class(conn, ["G3"])
    there, (_, taken) = _class(conn, ["G4", "G4"])
    said = _move(conn, child, "G4", there, "2")
    assert said == {"moved": False, "refused": "roll_taken"}
    assert _row(conn, child) == {"band": "G3", "section": here, "roll_no": "1"}
    assert _history(conn, child) == [], "a refused change leaves no row"
    assert _row(conn, taken)["roll_no"] == "2"


def test_a_grade_is_a_row_of_the_grade_table_and_nothing_typed_is_taken(conn):
    section, (child,) = _class(conn, ["G3"])
    assert _move(conn, child, "G99", section, "1") == {"moved": False, "refused": "no_such_grade"}
    assert _row(conn, child)["band"] == "G3"
    t = rows.tenant(conn)
    conn.execute("insert into grade (tenant_id, code, name, ord) values (%s, 'G99', 'Grade 99', 9999)", (t,))
    assert _move(conn, child, "G99", section, "1")["moved"] is True, (
        "a grade added as a row is a grade a child can have"
    )


@pytest.mark.parametrize(
    ("args", "refused"),
    [
        ({"section": "NO-SUCH-CLASS"}, "no_such_class"),
        ({"roll": "  "}, "bad_roll"),
        ({"roll": "1; drop"}, "bad_roll"),
        ({"by": " "}, "no_one"),
        ({}, "nothing_changes"),
    ],
)
def test_a_change_that_is_not_one_is_refused_in_words_and_writes_nothing(conn, args, refused):
    section, (child,) = _class(conn, ["G3"])
    said = _move(
        conn, child, "G3", args.get("section", section), args.get("roll", "1"), by=args.get("by", "someone")
    )
    assert said == {"moved": False, "refused": refused}
    assert _history(conn, child) == []


def test_a_child_who_does_not_exist_is_refused(conn):
    section, _ = _class(conn, ["G3"])
    assert _move(conn, uuid.uuid4(), "G4", section, "1")["refused"] == "no_such_child"


def test_the_history_is_append_only_and_holds_no_name(conn):
    section, (child,) = _class(conn, ["G3"])
    _move(conn, child, "G4", section, "1")
    [h] = conn.execute(
        "select before, after from change_log where table_name = 'child' and row_id = %s", (str(child),)
    ).fetchall()
    assert set(h["before"]) == set(h["after"]) == {"band", "section", "roll_no"}, "names stay in pii (rule 6)"
    with pytest.raises(Exception, match="append|change|forbid|ledger|read-only"):
        conn.execute("update change_log set reason = 'edited' where row_id = %s", (str(child),))
    conn.rollback()


def test_the_history_has_row_security_and_the_web_role_reads_it_and_moves_only_through_the_function(conn):
    flags = conn.execute(
        "select relrowsecurity as on_, relforcerowsecurity as forced from pg_class where relname = 'change_log'"
    ).fetchone()
    assert flags == {"on_": True, "forced": True}
    web = conn.execute("select 1 from pg_roles where rolname = 'app_web'").fetchone()
    if web:  # the roles of CI and live; a plain copy has none

        def can(table, p):
            return conn.execute("select has_table_privilege('app_web', %s, %s) as c", (table, p)).fetchone()[
                "c"
            ]

        assert [can("change_log", p) for p in ("select", "insert", "update", "delete")] == [
            True,
            False,
            False,
            False,
        ]
        assert [can("enrolment", p) for p in ("insert", "update", "delete")] == [False, False, False]
        calls = conn.execute(
            "select has_function_privilege('app_web', 'move_child(uuid,text,text,text,text,text,timestamptz)', 'execute') as c"
        ).fetchone()
        assert calls["c"] is True


def test_a_move_changes_the_grade_both_classes_work_at(conn):
    """The rule is the database's (`class_band`): most of the active children's grade, the lower on a tie."""
    old, (x, _y, _z) = _class(conn, ["G4", "G4", "G3"])
    new, _ = _class(conn, ["G3", "G4"])
    t = rows.tenant(conn)

    def said(s):
        return conn.execute("select class_band(%s, %s) as b", (t, s)).fetchone()["b"]

    assert (said(old), said(new)) == ("G4", "G3")
    _move(conn, x, "G4", new, "3")
    assert (said(old), said(new)) == ("G3", "G4")
    assert roster.class_band(conn, old) == "G3" and roster.class_band(conn, new) == "G4"


def test_a_move_withdraws_what_was_not_yet_made_and_leaves_every_paper_made_as_it_is(conn):
    section, (child,) = _class(conn, ["G3"])
    t = rows.tenant(conn)

    def plan(week, **kw):
        return conn.execute(
            "insert into prescription (tenant_id, child_id, week, rule_fired, kind, sheet_instance_id, override_by)"
            " values (%s, %s, %s, 'band_default', %s, %s, %s) returning id",
            (t, child, week, kw.get("kind", "practice"), kw.get("sheet"), kw.get("by")),
        ).fetchone()["id"]

    tpl = conn.execute(
        "insert into sheet_template (tenant_id, band, child_id, week, key, batch_id) values (%s, 'G3', %s, %s, '{}', 'MOV')"
        " returning id",
        (t, child, FUTURE),
    ).fetchone()["id"]
    printed = rows.an_approved_paper(conn, tpl, child, "someone")
    past, unmade, made, by_hand = (
        plan(PAST),
        plan(FUTURE),
        plan(FUTURE, kind="assessment", sheet=printed),
        plan(weeks.day("2099-W11"), by="educator@cornerstone.test"),
    )
    said = _move(conn, child, "G4", section, "1")
    left = {
        r["id"] for r in conn.execute("select id from prescription where child_id = %s", (child,)).fetchall()
    }
    assert left == {past, made, by_hand}, (
        "only a coming week's plan with no paper and no hand-set difficulty goes"
    )
    assert unmade not in left
    assert (said["prescriptions_withdrawn"], said["papers_made"]) == (1, 1)
    assert conn.execute("select print_status from sheet_instance where id = %s", (printed,)).fetchone() == {
        "print_status": "printed"
    }


def test_after_a_move_the_card_of_both_classes_is_built_from_the_class_the_child_is_in_now(conn):
    """A class card is built from the graph whenever it is asked for (no stored copy to go stale, CP-27 group 4)."""
    old, (x, y) = _class(conn, ["G3", "G3"])
    new, _ = _class(conn, ["G3"])
    _move(conn, x, "G3", new, "5")
    assert [k["id"] for k in card._children(conn, old)] == [y]
    assert x in [k["id"] for k in card._children(conn, new)]


def test_two_tables_carry_a_childs_class_or_grade_as_text_and_both_are_a_printed_paper(conn):
    """Where a copy would go stale: a table with a `child_id` that also holds a `section` or a `band` of its own. A move
    leaves these as they are because they say where a paper was printed; a table added later that does the same fails
    here until someone has said what a move does to it."""
    copies = conn.execute(
        "select c.table_name, c.column_name from information_schema.columns c"
        " where c.table_schema = 'public' and c.column_name in ('section', 'band', 'grade', 'class')"
        " and exists (select 1 from information_schema.columns k where k.table_schema = 'public'"
        "   and k.table_name = c.table_name and k.column_name = 'child_id')"
        " and c.table_name not in (select table_name from information_schema.views where table_schema = 'public')"
        " order by 1, 2"
    ).fetchall()
    assert [(r["table_name"], r["column_name"]) for r in copies] == [
        ("sheet_instance", "section"),
        ("sheet_template", "band"),
    ]


# CP-1: a move is also a change of enrolment, in the same step.


def _open(conn, child):
    return conn.execute(
        "select class_id, roll_no from enrolment where child_id = %s and to_date is null", (child,)
    ).fetchall()


def _class_id(conn, label):
    return conn.execute(
        "select id from school_class where tenant_id = %s and label = %s", (rows.tenant(conn), label)
    ).fetchone()["id"]


def test_a_move_between_classes_closes_one_enrolment_and_opens_another_in_one_step_with_one_history_row(conn):
    here, (child,) = _class(conn, ["G3"])
    there, _ = _class(conn, ["G3"])
    assert _move(conn, child, "G3", there, "7", reason="a smaller class")["moved"] is True
    [now] = _open(conn, child)
    assert now == {"class_id": _class_id(conn, there), "roll_no": "7"}
    closed = conn.execute(
        "select class_id, roll_no from enrolment where child_id = %s and to_date is not null", (child,)
    ).fetchall()
    assert closed == [{"class_id": _class_id(conn, here), "roll_no": "1"}], (
        "the old enrolment is kept, closed"
    )
    [h] = _history(conn, child)
    assert (h["from_section"], h["from_roll_no"], h["to_section"], h["to_roll_no"]) == (here, "1", there, "7")
    assert h["reason"] == "a smaller class"


def test_a_class_is_a_class_of_this_school_year(conn):
    here, (child,) = _class(conn, ["G3"])
    t = rows.tenant(conn)
    last_year = conn.execute(
        "insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '1999-00', '1999-04-01',"
        " '2000-03-31') returning id",
        (t,),
    ).fetchone()["id"]
    conn.execute(
        "insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)"
        " select tenant_id, campus_id, %s, grade_code, 'OLD', 'MOV-OLD' from school_class where id = %s",
        (last_year, _class_id(conn, here)),
    )
    assert _move(conn, child, "G3", "MOV-OLD", "9") == {"moved": False, "refused": "no_such_class"}
    assert [r["class_id"] for r in _open(conn, child)] == [_class_id(conn, here)]
    assert _history(conn, child) == []


def test_a_roll_held_on_an_open_enrolment_is_taken(conn):
    _, (child,) = _class(conn, ["G3"])
    there, _ = _class(conn, ["G3"])
    assert _move(conn, child, "G3", there, "1") == {"moved": False, "refused": "roll_taken"}


def test_an_enrolled_k2_child_is_moved_though_their_class_is_section_a(conn):
    """K2's class is grade K2, section A; its children are called by the label 'K2'. A move found a class by its
    section, so every enrolled K2 child was refused (`no_such_class`). A class is now found by its label."""
    t = rows.tenant(conn)
    k2 = f"K2-{uuid.uuid4().hex[:6].upper()}"
    child = a_child_in(conn, k2, "K2", "1", t)
    conn.execute("update school_class set section = 'A' where id = %s", (_class_id(conn, k2),))
    other = f"K2-{uuid.uuid4().hex[:6].upper()}"
    a_child_in(conn, other, "K2", "1", t)
    conn.execute("update school_class set section = 'B' where id = %s", (_class_id(conn, other),))
    assert _move(conn, child, "K2", other, "2")["moved"] is True
    assert _row(conn, child) == {"band": "K2", "section": other, "roll_no": "2"}
    assert _move(conn, child, "K2", other, "3")["moved"] is True, "a new roll in the same class"
    assert [h["to_roll_no"] for h in _history(conn, child)] == ["2", "3"]
