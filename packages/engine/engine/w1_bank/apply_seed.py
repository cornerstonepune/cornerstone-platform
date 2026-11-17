"""CP-54: applies the checked curriculum data files (`seed_rows`) as the machine's work, never a person's.

Everything it writes is origin 'machine' (an objective's `source`, a link's `source`), live at once, filterable and checked
as the week comes. A person's edit is never overwritten: an objective whose `source` is 'person', an activity the database
already has, a link a person made, a skill or topic already placed. A second run changes nothing. Each run leaves one
`flow_run` row (flow `curriculum.apply-seed`) that holds what every change replaced, so `revert` puts it back, for a row
nobody has changed since. An objective that is folded into its unit is marked `retired`, never deleted.
"""

import json
import uuid
from dataclasses import dataclass, field

from psycopg.types.json import Jsonb

from engine.core import db, history, settings
from engine.w1_bank import new_lo_ledger, seed_rows
from engine.w1_bank.seed_activity import by_a_person, refresh_activity
from engine.w1_bank.seed_rows import Row

FLOW = "curriculum.apply-seed"
PROFILE = "CS-PROFILE"


@dataclass
class Report:
    changes: list[Row] = field(default_factory=list)  # what was changed, with what it replaced
    rejected: list[tuple[str, Row, list[str]]] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)
    warnings: list[tuple[str, Row, str]] = field(default_factory=list)

    def skip(self, why: str) -> None:
        self.skipped[why] = self.skipped.get(why, 0) + 1

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for c in self.changes:
            out[c["kind"]] = out.get(c["kind"], 0) + 1
        return out


def _rewrite(conn: db.Conn, t: db.Id, row: Row, lo: Row, rep: Report) -> None:
    before = {k: lo[k] for k in ("title", "source_text", "signal", "source", "retired")}
    if lo["source"] == "person" or by_a_person(conn, t, "learning_objective", lo["code"]):
        return rep.skip("an objective a person has edited")
    if row["action"] == "fold_into_unit":
        if lo["retired"]:
            return rep.skip("already retired")
        conn.execute(
            "update learning_objective set retired = true, source = 'machine', updated_at = now()"
            " where tenant_id = %s and code = %s", (t, lo["code"]))  # fmt: skip
        return rep.changes.append({"kind": "lo_retired", "code": lo["code"], "before": before})
    if row["action"] == "rewrite":
        new = row["new_title"].strip()
        if lo["title"] == new and not lo["retired"]:
            return rep.skip("already as the file says")
        conn.execute(
            "update learning_objective set source_text = coalesce(source_text, title), title = %s, retired = false,"
            " signal = %s, source = 'machine', updated_at = now() where tenant_id = %s and code = %s",
            (new, row.get("signal") or lo["signal"], t, lo["code"]),
        )
        rep.changes.append({"kind": "lo_title", "code": lo["code"], "after": new, "before": before})


def _new_lo(conn: db.Conn, t: db.Id, lo: Row, rep: Report) -> None:
    name = conn.execute(
        "select name from subject where tenant_id = %s and code = %s", (t, lo["subject_code"] or "")
    ).fetchone()
    done = conn.execute(
        "insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code, kind)"
        " values (%s, %s, %s, %s, %s, %s, %s, 'machine', %s, %s) on conflict (tenant_id, code) do nothing returning code",
        (t, lo["code"], lo["band"], name["name"] if name else lo.get("subject_given", ""), lo.get("unit") or lo.get("subject_given", ""),
         lo["title"], lo.get("signal") or "Foundational", lo["subject_code"], lo.get("kind", "academic")),
    ).fetchone()  # fmt: skip
    if done:
        return rep.changes.append({"kind": "lo_new", "code": lo["code"]})
    have = conn.execute(
        "select title, source_text, signal, source, retired, unit, subject_code, subject from learning_objective"
        " where tenant_id = %s and code = %s", (t, lo["code"])).fetchone()  # fmt: skip
    if not have or have["source"] != "machine" or by_a_person(conn, t, "learning_objective", lo["code"]):
        return rep.skip(
            "a new objective a person has taken over" if have else "a new objective already there"
        )
    new = (
        lo["title"],
        lo.get("signal") or "Foundational",
        lo.get("unit") or have["unit"],
        lo["subject_code"],
        name["name"] if name else have["subject"],  # the label follows the code: one truth
    )
    if new == (have["title"], have["signal"], have["unit"], have["subject_code"], have["subject"]):
        return rep.skip("a new objective already there")
    conn.execute(
        "update learning_objective set title = %s, signal = %s, unit = %s, subject_code = %s, subject = %s, updated_at = now()"
        " where tenant_id = %s and code = %s", (*new, t, lo["code"]))  # fmt: skip
    rep.changes.append({"kind": "lo_title", "code": lo["code"], "after": lo["title"],
                        "before": {k: have[k] for k in ("title", "source_text", "signal", "source", "retired")}})  # fmt: skip


def _retire_orphans(conn: db.Conn, t: db.Id, rep: Report) -> None:
    """Machine-made objectives no ref in the files names any more and no activity uses: retired, listed for the coordinators."""
    for o in new_lo_ledger.orphans(conn, t, new_lo_ledger.load(seed_rows.ROOT)):
        conn.execute(
            "update learning_objective set retired = true, updated_at = now() where tenant_id = %s and code = %s",
            (t, o["code"]),
        )
        before = {
            "title": o["title"],
            "source_text": o["source_text"],
            "signal": o["signal"],
            "source": "machine",
            "retired": False,
        }
        rep.changes.append({"kind": "lo_retired", "code": o["code"], "before": before, "orphan": True})


def _activity(conn: db.Conn, t: db.Id, row: Row, lo_title: str, rep: Report) -> None:
    src, lv = row["source"], row.get("levels") or {}
    where = src.get("sheet") or src.get("doc")
    doc = {
        k: row[k] for k in ("look_fors", "basis") if row.get(k)
    }  # the three things to look for; what it was made from
    made = conn.execute(
        "insert into activity (tenant_id, code, band, strand, name, objective, level_0, level_1, level_2, level_3,"
        " confidence, note, source_file, source_tab, source_row, source_url, materials, steps, steps_list, subject_code,"
        " thinking_doc) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
        " on conflict (tenant_id, code) do nothing returning code",
        (t, row["code"], row["grade"], row.get("unit") or row.get("subject_given") or "", row["name"], lo_title,
         lv.get("0", ""), lv.get("1", ""), lv.get("2", ""), lv.get("3", ""), row.get("confidence", "medium"),
         row.get("note", ""), "machine seed (a Claude session, 16 Nov 2026): " + row["ref"], src["tab"],
         src.get("cell") or src.get("section") or src.get("bullet", ""), f"https://docs.google.com/{where}",
         row.get("materials", ""), "\n".join(f"{i}. {s}" for i, s in enumerate(row["steps"], 1)), Jsonb(row["steps"]),
         row["subject_code"], Jsonb(doc) if doc else None),
    ).fetchone()  # fmt: skip
    if not made:
        return refresh_activity(conn, t, row, lo_title, rep)
    for i, lo in enumerate(row["lo_codes"], 1):
        conn.execute(
            "insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (%s,%s,%s,%s,'machine')"
            " on conflict do nothing", (t, row["code"], lo, i))  # fmt: skip
    rep.changes.append({"kind": "activity", "code": row["code"]})


def _capability(conn: db.Conn, t: db.Id, rows: list[Row], rep: Report) -> None:
    """Exactly one capability group an objective counts toward: the machine's earlier rows for it are replaced."""
    groups = {r["code"] for r in conn.execute(
        "select code from framework_statement where tenant_id = %s and framework_code = %s and kind = 'group'"
        " and level_code is null", (t, PROFILE))}  # fmt: skip
    los = seed_rows.known_codes(conn, t)
    for row in rows:
        faults = (
            [f"{row.get('group')!r} is not a group of the profile"] if row.get("group") not in groups else []
        )
        faults += (
            [f"{row.get('lo_code')} is not an objective of the school"]
            if row.get("lo_code") not in los
            else []
        )
        if faults:
            rep.rejected.append(("capability_choices", row, faults))
            continue
        have = conn.execute(
            "select statement_code, source from objective_statement where tenant_id = %s and lo_code = %s"
            " and framework_code = %s and relation = 'counts_toward'", (t, row["lo_code"], PROFILE)).fetchall()  # fmt: skip
        if any(h["source"] != "machine" for h in have):
            rep.skip("an objective whose capability a person or the school has set")
            continue
        if [h["statement_code"] for h in have] == [row["group"]]:
            rep.skip("already as the file says")
            continue
        conn.execute(
            "delete from objective_statement where tenant_id = %s and lo_code = %s and framework_code = %s"
            " and relation = 'counts_toward' and source = 'machine'", (t, row["lo_code"], PROFILE))  # fmt: skip
        conn.execute(
            "insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source)"
            " values (%s, %s, %s, %s, 'counts_toward', 'machine')", (t, row["lo_code"], PROFILE, row["group"]))  # fmt: skip
        rep.changes.append({"kind": "capability", "lo": row["lo_code"], "after": row["group"],
                            "before": [h["statement_code"] for h in have]})  # fmt: skip


def _skill_lo(conn: db.Conn, t: db.Id, rows: list[Row], rep: Report) -> None:
    los = seed_rows.known_codes(conn, t)
    for row in rows:
        s = conn.execute(
            "select grade, lo_code from skill where tenant_id = %s and code = %s", (t, row.get("skill_code"))
        ).fetchone()
        lo = los.get(str(row.get("lo_code")))
        if not s or not lo or lo["band"] != s["grade"]:
            rep.rejected.append(
                ("engine_skill_lo", row, ["an engine skill names one objective of its own grade"])
            )
        elif s["lo_code"]:
            rep.skip("an engine skill already placed")
        else:
            conn.execute(
                "update skill set lo_code = %s where tenant_id = %s and code = %s",
                (row["lo_code"], t, row["skill_code"]),
            )
            rep.changes.append(
                {"kind": "skill_lo", "skill": row["skill_code"], "after": row["lo_code"], "before": None}
            )


def _topics(conn: db.Conn, t: db.Id, rows: list[Row], rep: Report) -> None:
    for row in rows:
        sub, unit = row.get("subject_code"), row.get("unit")
        new = row.get("new_topic")
        code = new["code"] if new else row.get("topic_code")
        have = conn.execute(
            "select subject_code from topic where tenant_id = %s and code = %s", (t, code)
        ).fetchone()
        if new and not have and sub:
            conn.execute(
                "insert into topic (tenant_id, code, subject_code, name, ord) select %s, %s, %s, %s,"
                " coalesce(max(ord), 0) + 1 from topic where tenant_id = %s and subject_code = %s",
                (t, code, sub, new["name"], t, sub),
            )
            rep.changes.append({"kind": "topic_new", "code": code})
            have = {"subject_code": sub}
        if not have or have["subject_code"] != sub:
            rep.rejected.append(("unit_topics", row, ["a topic of the unit's own subject"]))
            continue
        for lo in conn.execute(
            "select code from learning_objective where tenant_id = %s and subject_code = %s and unit = %s and topic_code is null"
            " and not retired and source <> 'person'", (t, sub, unit)).fetchall():  # fmt: skip
            conn.execute(
                "update learning_objective set topic_code = %s where tenant_id = %s and code = %s",
                (code, t, lo["code"]),
            )
            rep.changes.append({"kind": "topic", "lo": lo["code"], "after": code, "before": None})


PARTS = ("all", "objectives", "activities")


def _objectives(
    conn: db.Conn, t: db.Id, los: dict[str, Row], rewrites: seed_rows.Checked, rep: Report
) -> None:
    """The objectives' half: new wording, and the placements the placement files hold."""
    rep.rejected += [("lo_rewrites", r, f) for r, f in rewrites.rejected]
    rep.warnings += [("lo_rewrites", r, w) for r, w in rewrites.warnings]
    for row in rewrites.accepted:
        if row["action"] != "keep":
            _rewrite(conn, t, row, los[row["lo_code"]], rep)
    for name, fn in (
        ("capability_choices", _capability),
        ("engine_skill_lo", _skill_lo),
        ("unit_topics", _topics),
    ):
        fn(conn, t, seed_rows.read(seed_rows.ROOT / f"{name}.json").get("rows", []), rep)


def _activities(
    conn: db.Conn, t: db.Id, acts: seed_rows.Checked, titles: dict[str, str], rep: Report
) -> None:
    """The activities' half."""
    rep.rejected += [("activities", r, f) for r, f in acts.rejected]
    for row in acts.accepted:
        _activity(conn, t, row, titles.get(row["lo_codes"][0], "") if row["lo_codes"] else "", rep)


def _record(conn: db.Conn, t: db.Id, rep: Report, part: str) -> uuid.UUID | None:
    made = conn.execute(
        "insert into flow_run (tenant_id, flow, trigger, status, finished_at, request, result)"
        " values (%s, %s, 'engine', 'ok', now(), %s, %s) returning id",
        (t, FLOW, Jsonb({"counts": rep.counts(), "part": part}), Jsonb({"changes": rep.changes})),
    ).fetchone()
    return made["id"] if made else None


def apply(
    conn: db.Conn, t: db.Id, write: bool = True, teaching_formats: list[str] | None = None, part: str = "all"
) -> tuple[Report, uuid.UUID | None]:
    """Check every file and apply what passes; with `write` False nothing is written but the report is the same.

    `part` loads the two halves of the data apart, each as a run of its own (so `revert-seed` puts back one half):
    `objectives` is the objectives' new titles, the retired and the new objectives, and the capability, skill and topic
    placements; `activities` is the activities (and the new objectives they name, which are made once and kept)."""
    if part not in PARTS:
        raise ValueError(f"part is one of {', '.join(PARTS)}")
    history.by(conn, "seed:curriculum")  # what the seed changes is kept as the seed's, never as a person's
    rep = Report()
    los = seed_rows.known_codes(conn, t)
    rewrites = seed_rows.lo_rewrites(conn, t)
    acts, new_los, new_done = seed_rows.activities(
        conn, t, teaching_formats or settings.config(conn, "curriculum.teaching_formats", []) or []
    )
    rep.rejected += [("new_los", r, f) for r, f in new_done.rejected]
    try:
        if part in ("all", "objectives"):
            _objectives(conn, t, los, rewrites, rep)
        for lo in new_los:
            _new_lo(conn, t, lo, rep)
        if part in ("all", "objectives"):
            _retire_orphans(conn, t, rep)
        if part in ("all", "activities"):
            titles = {**{c: x["title"] for c, x in los.items()}, **{n["code"]: n["title"] for n in new_los}}
            _activities(conn, t, acts, titles, rep)
        run = _record(conn, t, rep, part) if write and rep.changes else None
        if not write:
            conn.rollback()
        return rep, run
    except Exception:
        conn.rollback()
        raise


def apply_rows(
    conn: db.Conn, t: db.Id, kind: str, rows: list[Row], by: str = ""
) -> tuple[Report, uuid.UUID | None]:
    """Rows a run of the engine made (capability_choices, engine_skill_lo, unit_topics), applied as the seed files' are."""
    rep, fn = Report(), {"capability": _capability, "skill_lo": _skill_lo, "topic": _topics}[kind]
    fn(conn, t, rows, rep)
    run = None
    if rep.changes:
        made = conn.execute(
            "insert into flow_run (tenant_id, flow, trigger, status, finished_at, request, result)"
            " values (%s, %s, 'engine', 'ok', now(), %s, %s) returning id",
            (
                t,
                FLOW,
                Jsonb({"counts": rep.counts(), "kind": kind, "by": by}),
                Jsonb({"changes": rep.changes}),
            ),
        ).fetchone()
        run = made["id"] if made else None
    return rep, run


def revert(conn: db.Conn, t: db.Id, run: uuid.UUID) -> dict[str, int]:
    """Put back what a run replaced, for each row nobody has changed since; counts what went back (`seed_revert`)."""
    from engine.w1_bank import seed_revert

    return seed_revert.revert(conn, t, run)


def counts_json(rep: Report) -> str:
    return json.dumps({"changes": rep.counts(), "rejected": len(rep.rejected), "skipped": rep.skipped})
