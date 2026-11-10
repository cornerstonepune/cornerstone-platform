"""W1 gate 4 — the two reviewers, and the eval that says whether to believe them.

Two narrow advisory passes, each a prompt row: `pedagogy_review` asks whether an item tests the
skill, rung and signal it claims; `language_review` asks whether a child of that grade can read
it. Neither is final authority — both return a verdict a person can overrule, which is why the
column is `verdict` and not `status`.

The cost discipline is ADR 0010's: judge the *band's rule* once, then a sample of at most 5 % of
that unit's items. A per-item review would put the whole token cost back that enumerating the
bank just removed.
"""

import json
import random

from psycopg.types.json import Jsonb

from engine.adapters import llm
from engine.assess import words as W
from engine.core import db, levels

REVIEWERS = ("pedagogy_review", "language_review")
SAMPLE_FRACTION = 0.05
VERDICTS = ("pass", "revise", "reject")


def _subject_line(ref, text, answer=None):
    return {"ref": ref, "text": text, **({"answer": str(answer)} if answer is not None else {})}


def _band_subject(s, difficulty):
    """The band's rule itself, as one thing to judge — the template-level check that runs once."""
    band = s["difficulty"][difficulty]
    return _subject_line(
        f"template:{s['code']}:{difficulty}", f"{difficulty} band of {s['name']}: {band['words']}"
    )


def _item_subjects(rows):
    out = []
    for r in rows:
        first = next((x for x in r["responses"] if x.get("answer") is not None), None)
        text = r["stem"] or _bare(r["spec"])
        out.append(_subject_line(r["item_key"], text, first["answer"] if first else None))
    return out


def _bare(spec):
    if {"a", "b", "op"} <= spec.keys():
        return f"{spec['a']} {spec['op']} {spec['b']} = ?"
    return json.dumps(spec, ensure_ascii=False)


def sample(conn, code, difficulty, fraction=SAMPLE_FRACTION, seed=None, cap=10):
    """At most `fraction` of the unit's live items, never more than `cap` in one call."""
    rows = conn.execute(
        "select item_key, stem, spec, responses from item where status = 'active'"
        " and skill_set_code = %s and difficulty = %s order by item_key",
        (code, difficulty),
    ).fetchall()
    if not rows:
        return []
    n = min(cap, max(1, int(len(rows) * fraction)))
    return random.Random(seed).sample(rows, n)


def review_unit(conn, code, difficulty, reviewer, fraction=SAMPLE_FRACTION, seed=None, store=True):
    """One reviewer over one unit: the band's rule, plus a ≤5 % sample of its items.

    Returns (verdicts, meta). Every verdict is stored against the item it judges so a rejection
    is a row a person can act on, not a line in a log that scrolls away.
    """
    if reviewer not in REVIEWERS:
        raise ValueError(f"unknown reviewer {reviewer!r}; expected one of {', '.join(REVIEWERS)}")
    s = levels.skill(conn, code)
    if difficulty not in s["difficulty"]:
        raise ValueError(f"{code} has no difficulty {difficulty!r}")

    rows = sample(conn, code, difficulty, fraction, seed)
    subjects = [_band_subject(s, difficulty)] + _item_subjects(rows)
    band = s["grade"]
    variables = {
        "skill_set": {
            "code": s["code"],
            "name": s["name"],
            "rung": s["rung_code"],
            "learning_objective": s["learning_objective"],
            "signal_note": "the signal each item claims is on the item",
            "band_rule": s["difficulty"][difficulty]["words"],
        },
        "band": band,
        "names": W.NAMES,
        "subjects": subjects,
    }
    meta = {}
    out = llm.generate(conn, reviewer, variables, meta=meta)
    verdicts = out["verdicts"]
    if store:
        record(conn, reviewer, code, difficulty, verdicts, meta)
    return verdicts, meta


def record(conn, reviewer, code, difficulty, verdicts, meta):
    """Each verdict as a case of the one eval set (`eval_case`, kind `item_review`), one per reviewer and question or
    level rule: a review run again replaces its verdict, and leaves who acted on it."""
    tenant = conn.execute("select id from tenant where slug = %s", (db.tenant_slug(),)).fetchone()["id"]
    for v in verdicts:
        detail = {"reasons": v.get("reasons", []), "note": v.get("note", "")} | {
            k: str(meta[k]) if meta.get(k) is not None else None
            for k in ("prompt_id", "model", "flow_run_id")
        }
        conn.execute(
            "insert into eval_case (tenant_id, kind, source, skill_code, difficulty, ref, verdict, detail)"
            " values (%s, 'item_review', %s, %s, %s, %s, %s, %s)"
            # what a person did with the last verdict (`acted_at`) and where a row came from stay
            " on conflict (tenant_id, source, ref) where kind = 'item_review' do update set verdict = excluded.verdict,"
            " detail = eval_case.detail || excluded.detail",
            (tenant, reviewer, code, difficulty, v["ref"], v["verdict"], Jsonb(detail)),
        )


def verdicts(conn, ref) -> list[dict]:
    """Every reviewer's verdict on a question or a level's rule (`template:<skill>:<level>`), and who acted on it."""
    return conn.execute(
        "select source as reviewer, skill_code, difficulty, verdict,"
        " array(select jsonb_array_elements_text(detail -> 'reasons')) as reasons, detail ->> 'note' as note,"
        " confirmed_by as acted_on_by, (detail ->> 'acted_at')::timestamptz as acted_at from eval_case"
        " where kind = 'item_review' and ref = %s order by source",
        (ref,),
    ).fetchall()


def evaluate(conn, reviewer, gold):
    """Score a reviewer against hand-judged cases: does it agree with a person?

    Scored on the verdict, and separately on whether it gave the right *reason* — a reviewer that
    rejects the right items for the wrong reason cannot be trusted to explain itself to a teacher.
    """
    cases = [c for c in gold["cases"] if c["reviewer"] == reviewer]
    if not cases:
        raise ValueError(
            f"no hand-judged case for {reviewer} in validator_gold.json: nothing to score it against"
        )
    by_ref = {c["ref"]: c for c in cases}

    # One call per (skill set, band), each carrying that band's own rule. A harness that sends
    # one skill set's context for cases belonging to three, or blanks the rule and then scores
    # the reviewer for not knowing it, measures the harness rather than the reviewer.
    groups = {}
    for c in cases:
        groups.setdefault((c["skill_set"], c["difficulty"]), []).append(c)

    got, meta, cost = {}, {}, 0.0
    for (code, difficulty), group in groups.items():
        s = levels.skill(conn, code)
        band = s["grade"]
        variables = {
            "skill_set": {
                "code": s["code"],
                "name": s["name"],
                "rung": s["rung_code"],
                "learning_objective": s["learning_objective"],
                "band_rule": s["difficulty"][difficulty]["words"],
            },
            "band": band,
            "names": W.NAMES,
            "subjects": [_subject_line(c["ref"], c["text"], c.get("answer")) for c in group],
        }
        m = {}
        out = llm.generate(conn, reviewer, variables, meta=m)
        got.update({v["ref"]: v for v in out["verdicts"]})
        meta = m
        cost += m.get("cost_inr") or 0

    agreed = reason_ok = 0
    disagreements = []
    for ref, want in by_ref.items():
        v = got.get(ref)
        if v and v["verdict"] == want["expected"]:
            agreed += 1
            if not want["expected_reasons"] or set(want["expected_reasons"]) & set(v.get("reasons", [])):
                reason_ok += 1
        else:
            disagreements.append(
                {
                    "ref": ref,
                    "expected": want["expected"],
                    "got": v["verdict"] if v else "(no verdict)",
                    "text": want["text"][:70],
                }
            )
    return {
        "cases": len(cases),
        "agreed": agreed,
        "reason_agreed": reason_ok,
        "rate": round(agreed / len(cases), 2),
        "disagreements": disagreements,
        "model": meta.get("model"),
        "cost_inr": round(cost, 4),
        "calls": len(groups),
    }
