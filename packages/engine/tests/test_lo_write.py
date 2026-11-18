"""CP-54: the real objective write (engine/w1_bank/lo_write.py, `engine curriculum lo-write`). A made-up asker answers: no model.

One test a behaviour. Nightly only: not in core.txt, not @core (Nimish, 18 Nov: no unnecessary tests)."""

import os

import pytest
from typer.testing import CliRunner

from engine.core import db, settings, skill_spec
from engine.skills import machines, spend
from engine.w1_bank import apply_seed, lo_write
from tests.link_rows import staff
from tests.rows import tenant

pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="needs DATABASE_URL (see .env.example)")
SKILL = skill_spec.read(settings.SEED / "skills" / "learning-objective")
PASS = {"verdict": "pass", "faults": []}


@pytest.fixture
def world():
    with db.connect() as conn:
        t = tenant(conn)
        conn.execute(
            "insert into grade (tenant_id, code, name, ord) values (%s, 'KT', 'A test grade', 99) on conflict do nothing",
            (t,),
        )
        yield conn, t
        conn.rollback()


def add(conn, t, code, title, source="school", retired=False, unit="Arts"):
    conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, retired, kind)"
        " values (%s, %s, 'KT', 'Art', %s, %s, 'Foundational', %s, %s, 'character')",
        (t, code, unit, title, source, retired),
    )


def writer(says=None, validator=None):
    """An asker: the writer says what it is told of the job's line (or a sentence of its own), the validator `validator`."""
    seen = []

    def ask(purpose, variables, about):
        seen.append((purpose, variables, about))
        if purpose.endswith(".validate"):
            return validator(variables) if validator else PASS
        text = (says or {}).get(
            about
        ) or f"The child draws a picture of {about.lower()} with crayons on paper."
        return {"text": text, "signal": "Foundational", "source": "school-syllabus",
                "source_text": variables["inputs"]["text"], "confidence": "low", "assumption": "the action was assumed"}  # fmt: skip

    ask.seen = seen
    return ask


def test_the_jobs_are_the_lines_not_yet_objectives_and_a_list_is_one_job_a_part(world):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    add(conn, t, "LO-KT-2", "Colours: red, blue / green")
    add(conn, t, "LO-KT-3", "The child names a colour.")
    add(conn, t, "LO-KT-4", "Encourages play", retired=True)
    add(conn, t, "LO-KT-5", "Builds patience", source="person")
    got = lo_write.jobs(conn, t, "KT", SKILL["lists"])
    assert [j["key"] for j in got] == ["LO-KT-1", "LO-KT-2", "LO-KT-2#1", "LO-KT-2#2"]
    assert (
        got[1]["inputs"]["part"] == "Colours: red"
        and got[1]["inputs"]["text"] == "Colours: red, blue / green"
    )
    assert [o["code"] for o in lo_write.pool(conn, t, "KT")] == ["LO-KT-3"]


def test_the_grades_are_those_with_lines_not_yet_objectives_and_a_run_with_no_grade_takes_them_all(world):
    conn, t = world
    add(conn, t, "LO-KT-3", "The child names a colour.")
    assert "KT" not in lo_write.grades(conn, t)
    add(conn, t, "LO-KT-1", "Makes children alert")
    assert "KT" in lo_write.grades(conn, t)


def test_a_line_a_person_has_edited_is_not_a_job(world):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    add(conn, t, "LO-KT-2", "Builds patience")
    sid = staff(conn, t)
    conn.execute("select set_config('app.staff_id', %s, true)", (str(sid),))
    conn.execute(
        "update learning_objective set title = 'Builds patience, slowly' where code = 'LO-KT-2' and tenant_id = %s",
        (t,),
    )
    conn.execute("select set_config('app.staff_id', '', true)")
    assert [j["key"] for j in lo_write.jobs(conn, t, "KT", SKILL["lists"])] == ["LO-KT-1"]


def test_the_forecast_is_computed_by_code_and_counts_what_the_nearest_lists_add(world):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    add(conn, t, "LO-KT-2", "Builds patience")
    todo = lo_write.jobs(conn, t, "KT", SKILL["lists"])
    near = [
        {"code": f"LO-KT-{i}", "text": "The child makes children alert in a game " * 3} for i in range(20)
    ]
    bare, with_near = (
        lo_write.forecast(conn, SKILL, todo, {"KT": []}),
        lo_write.forecast(conn, SKILL, todo, {"KT": near}),
    )
    assert bare.jobs == 2 and bare.nearest_inr == 0 and bare.inr > 0 and bare.worst_inr > bare.inr
    assert with_near.nearest_inr > 0 and with_near.inr > bare.inr


def test_each_objective_written_is_shown_to_the_checks_of_the_next(world):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    add(conn, t, "LO-KT-2", "Builds alert children")
    todo = lo_write.jobs(conn, t, "KT", SKILL["lists"])
    ask = writer({"LO-KT-1": "The child points to the alert bird in the picture book.",
                  "LO-KT-2": "The child points to a bird in the picture book."})  # fmt: skip
    done = lo_write.run(SKILL, todo, {"KT": []}, ask)
    second = [v for p, v, a in ask.seen if p.endswith(".validate") and a == "LO-KT-2"][0]
    assert [o["code"] for o in second["inputs"]["nearest"]] == ["LO-KT-1"] and len(done.written) == 2


def test_a_job_refused_as_a_repeat_ends_as_a_repeat_of_that_code_and_leaves_no_row(world):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    pool = [{"code": "LO-KT-9", "text": "The child draws a picture of lo-kt-1 with crayons on paper."}]
    todo = lo_write.jobs(conn, t, "KT", SKILL["lists"])
    done = lo_write.run(SKILL, todo, {"KT": pool}, writer())
    assert [(j["key"], c) for j, c in done.repeats] == [("LO-KT-1", "LO-KT-9")] and not done.written
    lo_write.apply(conn, t, done, "a@b.invalid")
    assert (
        conn.execute("select title from learning_objective where code = 'LO-KT-1'").fetchone()["title"]
        == "Makes children alert"
    )


def test_the_first_part_rewrites_in_place_keeping_the_line_and_the_other_parts_are_new_and_the_run_is_undone_whole(
    world,
):
    conn, t = world
    add(conn, t, "LO-KT-1", "Colours: red, blue")
    add(conn, t, "LO-KT-2", "Makes children alert")
    done = lo_write.run(SKILL, lo_write.jobs(conn, t, "KT", SKILL["lists"]), {"KT": []}, writer())
    rep, run = lo_write.apply(conn, t, done, "a@b.invalid")
    got = {
        r["code"]: r
        for r in conn.execute(
            "select code, title, source, source_text, confidence from learning_objective where band = 'KT'"
        )
    }
    assert (
        got["LO-KT-1"]["title"].startswith("The child")
        and got["LO-KT-1"]["source_text"] == "Colours: red, blue"
    )
    assert got["LO-KT-1"]["source"] == "machine" and got["LO-KT-1"]["confidence"] == "low"
    new = [r for c, r in got.items() if c.startswith("LO-KT-N")]
    assert len(new) == 1 and new[0]["source"] == "machine" and new[0]["source_text"] == "Colours: red, blue"
    assert rep.counts() == {"lo_title": 2, "lo_new": 1}
    assert (
        conn.execute(
            "select count(*) n from flow_run where id = %s and flow = 'curriculum.apply-seed'", (run,)
        ).fetchone()["n"]
        == 1
    )
    apply_seed.revert(conn, t, run)
    back = {
        r["code"]: r["title"]
        for r in conn.execute("select code, title from learning_objective where band = 'KT'")
    }
    assert back == {"LO-KT-1": "Colours: red, blue", "LO-KT-2": "Makes children alert"}


def test_a_line_a_person_edits_after_the_jobs_were_built_is_not_overwritten(world):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    done = lo_write.run(SKILL, lo_write.jobs(conn, t, "KT", SKILL["lists"]), {"KT": []}, writer())
    sid = staff(conn, t)
    conn.execute("select set_config('app.staff_id', %s, true)", (str(sid),))
    conn.execute(
        "update learning_objective set title = 'Their own words' where code = 'LO-KT-1' and tenant_id = %s",
        (t,),
    )
    conn.execute("select set_config('app.staff_id', '', true)")
    rep, _ = lo_write.apply(conn, t, done, "a@b.invalid")
    assert (
        conn.execute("select title from learning_objective where code = 'LO-KT-1'").fetchone()["title"]
        == "Their own words"
    )
    assert rep.skipped == {"an objective a person has edited": 1}


def test_the_run_stops_at_its_ceiling_and_says_how_many_were_not_reached(world):
    conn, t = world
    for i in range(1, 5):
        add(conn, t, f"LO-KT-{i}", f"Builds patience {i}")
    todo = lo_write.jobs(conn, t, "KT", SKILL["lists"])
    one_job = spend.price(conn, SKILL, False) + spend.price(conn, SKILL, True)
    paid = writer()

    def costly(
        purpose, variables, about
    ):  # a real call leaves its cost on flow_run, which is what the ceiling counts
        conn.execute(
            "insert into flow_run (tenant_id, flow, trigger, status, finished_at, cost_inr)"
            " values (%s, 'skill.learning-objective', 'test', 'ok', now(), %s)",
            (t, spend.price(conn, SKILL, purpose.endswith(".validate"))),
        )
        return paid(purpose, variables, about)

    ask = spend.capped(costly, conn, {"learning-objective": SKILL}, one_job * 1.5, spend.started(conn))
    done = lo_write.run(SKILL, todo, {"KT": []}, ask)
    assert done.stopped and 0 < len(done.written) < len(todo)


def test_the_estimate_makes_no_call_and_prints_counts_and_rupees_only(world, monkeypatch):
    conn, t = world
    add(conn, t, "LO-KT-1", "Makes children alert")
    conn.commit()  # the command reads through a connection of its own
    from engine.cli import app

    monkeypatch.setattr(
        machines, "model_ask", lambda *a, **k: (_ for _ in ()).throw(AssertionError("a call was made"))
    )
    try:
        out = CliRunner().invoke(app, ["curriculum", "lo-write", "--grade", "KT", "--estimate"])
    finally:
        conn.execute("delete from learning_objective where tenant_id = %s and band = 'KT'", (t,))
        conn.execute("delete from grade where tenant_id = %s and code = 'KT'", (t,))
        conn.commit()
    assert out.exit_code == 0 and "1 lines to write as 1 jobs" in out.output and "₹" in out.output
    assert "alert" not in out.output  # the school's words are never printed: the server's log is public
