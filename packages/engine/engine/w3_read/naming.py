"""W3/N9 — the mistake behind a wrong answer that no named mistake explains, named by a person (ADR 0036): Jev's three
likeliest first (`w1_bank/mistake_guess`), and every named mistake of the operation for when those three miss. Kept
on the answer against the reading it was named on (`item_result.named_mistakes`, one entry per reading, each change kept
in the one history log); the answer's mark carries it, and `marking` keeps a naming whenever the same reading is saved
again (`named`). Its own module since marking an equation's boxes together
(goals/s24-a-split-that-holds-is-right.yaml) took `marking.py` past the 400-line ceiling: marking says whether an
answer is right, this says why a wrong one is wrong."""

import json

from engine.assess import learned_rules as L
from engine.core import history
from engine.w1_bank import mistake_guess


def named(conn, result_id, answer):
    """The mistake a person last named for this answer, on this reading of it: [code], or [] (none, or not named)."""
    row = conn.execute(
        "select named_mistakes -> %s ->> 'code' as code from item_result where id = %s", (answer, result_id)
    ).fetchone()
    return [row["code"]] if row and row["code"] and row["code"] != mistake_guess.NONE else []


# The answers on one copy, by its capture or by the paper the Marking page shows (`sheet_instance`): the page passed
# the paper's id, and a filter on the capture alone found no answer on it, so the shortlist never showed (2026-09-30).
ONE_PAPER = (
    "r.capture_id in (select c.id from capture c where %s::uuid in (c.id, c.sheet_instance_id)"
    " and c.superseded_by is null)"
)


def _waiting(conn, where, arg):
    """Wrong answers not yet signed off that no mistake is named for, with what the child wrote."""
    rows = conn.execute(
        "select r.id, i.spec, result_response(i.responses, r.rid) as response, r.raw_read, r.named_mistakes,"
        " (select rc.human_read from read_correction rc where rc.item_result_id = r.id"
        "  order by rc.created_at desc limit 1) as typed"
        " from item_result r join item i on i.id = r.item_id"
        f" where {where} and r.state = 'candidate' and r.status = 'wrong' and r.misconception_codes = '{{}}'",
        (arg,),
    ).fetchall()
    out = []
    for r in rows:
        answer = (
            r["typed"]
            if r["typed"] is not None
            else json.loads(r["raw_read"] or "{}").get("child_answer", "")
        )
        if answer not in (r["named_mistakes"] or {}):
            out.append((r, answer))
    return out


def unnamed(conn, capture_id):
    """{result_id: {"answer", "shortlist": [[code, chance], …], "options": [every code], "why"}} for a paper's wrong
    answers that no named mistake explains and no person has named yet — Jev's three likeliest, or NONE
    (`w1_bank/mistake_guess`, ADR 0036), and every named mistake of the operation for when those three miss. Jev
    unreachable is not a failure of the page: the shortlist is empty and `why` says so."""
    out = {}
    for r, answer in _waiting(conn, ONE_PAPER, capture_id):
        op = (r["spec"] or {}).get("op")
        if op not in mistake_guess.SIGN or not L.works_the_sum(r["spec"] or {}, r["response"] or {}):
            continue  # Jev and the operation's mistakes explain a wrong sum, not a wrong estimate or check of it
        why = ""
        try:
            short = mistake_guess.shortlist(conn, r["spec"], answer) or []
        except mistake_guess.jev.JevError as e:
            short, why = [], f"Jev could not be asked: {e}"
        out[str(r["id"])] = {
            "answer": answer,
            "shortlist": [[c, p] for c, p in short],
            "options": mistake_guess.codes(op),
            "why": why,
        }
    return out


def name_mistake(conn, result_id, code, by, proposed=()):
    """A person names the mistake behind a wrong answer no named mistake explains: one of its operation's named
    mistakes, or NONE. Kept on the answer against the reading it was named on, the change in the history log; the
    answer's mark carries it."""
    found = _waiting(conn, "r.id = %s", result_id)
    if not found:
        raise ValueError(f"no wrong answer waiting to be named with id {result_id}")
    row, answer = found[0]
    op = (row["spec"] or {}).get("op")
    if op not in mistake_guess.SIGN or code not in mistake_guess.codes(op):
        raise ValueError(f"{code!r} is not a named mistake of {op!r}, nor {mistake_guess.NONE}")
    if not L.works_the_sum(row["spec"] or {}, row["response"] or {}):
        raise ValueError(
            f"answer {result_id} is not its question's sum worked out: no mistake of {op!r} names it"
        )
    said = {"code": code, "proposed": [list(x) for x in proposed], "by": by}
    named = conn.execute(
        "update item_result set misconception_codes = %s, named_mistakes = coalesce(named_mistakes, '{}')"
        " || jsonb_build_object(%s::text, %s::jsonb || jsonb_build_object('at', clock_timestamp())),"
        " updated_at = now() where id = %s returning tenant_id, named_mistakes -> %s::text as now",
        ([] if code == mistake_guess.NONE else [code], answer, json.dumps(said), result_id, answer),
    ).fetchone()
    history.keep(
        conn,
        named["tenant_id"],
        ("item_result", str(result_id), "name_mistake"),
        None,
        {answer: named["now"]},
        by,
    )
    return {"code": code, "answer": answer}
