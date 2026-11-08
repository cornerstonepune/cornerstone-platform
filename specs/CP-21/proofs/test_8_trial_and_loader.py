"""CP-21 item 8 (the parts that run off the box): a trial run shows what would change, date by date, and writes
nothing; loading the school's sheet again refuses a fortnight that is live."""

import uuid

from conftest import ROOT, generated, go_live, ins, needs, run_with, snapshot, swapped, teaching, world

TABS = ROOT / "supabase" / "seed" / "k2_tabs_2026_11_04"


def test_a_trial_run_shows_each_date_and_writes_nothing(conn, engine, monkeypatch):
    w = world(conn, monkeypatch)
    run = run_with(conn, generated(conn, engine, w), swapped(w))
    was = snapshot(conn, w)
    code, out = go_live(engine, w, run, extra=("--dry",))
    assert code == 0, out
    missing = [d.isoformat() for d in teaching(w, 2) if d.isoformat() not in out]
    assert not missing, f"the trial run does not show {missing}:\n{out}"
    assert snapshot(conn, w) == was, "the trial run wrote something"


def _load(engine, section):
    return engine("timetable", "load", "--frame", TABS / "frame.csv", "--spans", TABS / "frame_spans.json",
                  "--planner", TABS / "planner.csv", "--calendar", TABS / "calendar.csv", "--grade", "K2",
                  "--section", section, "--year", "2026-27", "--from", "10", "--to", "10", "--apply")


def test_loading_the_schools_sheet_again_refuses_a_live_fortnight(conn, engine, monkeypatch):
    """Fortnight 10 of the committed sheet, loaded into a fake school, then marked live (CP-11's run and CP-21's record,
    made directly: fortnight 10 has started by the time this runs nightly, so it cannot be put live by the command).
    One of its sessions is then gone, as a generated timetable may remove one; loading the sheet again must not put it
    back, and must say the fortnight is live."""
    slug = f"cp21-{uuid.uuid4().hex[:8]}"
    t = conn.execute("insert into tenant (slug, name) values (%s, 'Proof School') returning id", (slug,)).fetchone()["id"]
    monkeypatch.setenv("TENANT_SLUG", slug)
    campus = conn.execute("insert into campus (tenant_id, name) values (%s, 'Proof campus') returning id",
                          (t,)).fetchone()["id"]
    year = conn.execute("insert into academic_year (tenant_id, label, starts_on, ends_on) values (%s, '2026-27',"
                        " '2026-04-01', '2027-03-31') returning id", (t,)).fetchone()["id"]
    section = f"P{uuid.uuid4().hex[:5]}"
    klass = conn.execute("insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section)"
                         " values (%s, %s, %s, 'K2', %s) returning id", (t, campus, year, section)).fetchone()["id"]
    code, out = _load(engine, section)
    assert code == 0, f"the existing load failed before anything of CP-21 was involved:\n{out}"
    fn = conn.execute("select id from fortnight where academic_year_id = %s and number = 10", (year,)).fetchone()["id"]

    needs(conn, "public.timetable_run", "CP-11 (the generator, issue #459)")
    needs(conn, "public.timetable_live", "CP-21 itself")
    staff = conn.execute("insert into staff (tenant_id, campus_id) values (%s, %s) returning id",
                         (t, campus)).fetchone()["id"]
    run = ins(conn, "timetable_run", tenant_id=t, school_class_id=klass, fortnight_id=fn, outcome="placed",
              input_text="proof", draft="[]")
    ins(conn, "timetable_live", tenant_id=t, school_class_id=klass, fortnight_id=fn, run_id=run, snapshot="[]",
        who=staff)
    gone = conn.execute(
        "delete from session where id = (select s.id from session s join school_day d on d.id = s.school_day_id"
        " join fortnight f on f.id = %s and d.on_date between f.starts_on and f.ends_on"
        " where s.school_class_id = %s and not exists (select 1 from materials_line_source m where m.session_id = s.id)"
        " order by d.on_date, s.period_id limit 1) returning id, school_day_id, period_id", (fn, klass)).fetchone()
    assert gone, "fortnight 10 loaded no session"
    count = "select count(*) as n from session where school_class_id = %s"
    had = conn.execute(count, (klass,)).fetchone()["n"]

    code, out = _load(engine, section)

    assert "live" in out.lower(), f"the load does not say fortnight 10 is live:\n{out}"
    assert conn.execute("select 1 from session where school_class_id = %s and school_day_id = %s and period_id = %s",
                        (klass, gone["school_day_id"], gone["period_id"])).fetchone() is None, "the session came back"
    assert conn.execute(count, (klass,)).fetchone()["n"] == had, "the load wrote sessions into a live fortnight"
