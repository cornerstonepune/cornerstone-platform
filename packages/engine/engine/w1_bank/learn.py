"""The bank learns from children's confirmed answers and proposes; a person decides (step 7,
goals/s21-real-difficulty.yaml).

A question's real difficulty is the share of children who got it right, counted only from answers a person has
confirmed (`item_stat`, ring B: rebuilt from nothing each time). A question far easier or far harder than its level
— above `item.flag_high_p` or below `item.flag_low_p`, over at least `item.min_attempts` answers — becomes a
proposal. A person removes it from the bank (`question.remove`: its worksheets are rebuilt) or keeps it. The level
itself is not moved: a level is a rule its questions are measured against (digits, regrouping), and when many of a
level's questions are off, it is the rule people revisit.
"""

import uuid

from engine.core import settings, signer
from engine.w1_bank import learned, question

LOW, HIGH, MIN = ("item.flag_low_p", 0.20), ("item.flag_high_p", 0.95), ("item.min_attempts", 10)


def _bar(conn, row):
    key, default = row
    return settings.threshold(conn, key, default)


def item_stats(conn) -> int:
    """`item_stat` rebuilt from confirmed answers: each question's attempts, share right, and whether it is far off
    its level. A reading still waiting for a person, or one a later read replaced, is not evidence."""
    low, high, least = _bar(conn, LOW), _bar(conn, HIGH), _bar(conn, MIN)
    conn.execute("delete from item_stat")
    return conn.execute(
        "insert into item_stat (tenant_id, item_id, n, p_correct, flagged_mislevelled)"
        " select r.tenant_id, r.item_id, count(*), avg((r.status = 'correct')::int)::numeric(5, 4),"
        "        count(*) >= %s and (avg((r.status = 'correct')::int) < %s or avg((r.status = 'correct')::int) > %s)"
        " from item_result r join capture c on c.id = r.capture_id"
        " where r.state = 'confirmed' and r.status in ('correct', 'wrong', 'blank') and c.superseded_by is null"
        " group by r.tenant_id, r.item_id",
        (least, low, high),
    ).rowcount


def stat(conn, item_key):
    return conn.execute(
        "select s.* from item_stat s join item i on i.id = s.item_id where i.item_key = %s", (item_key,)
    ).fetchone()


def refresh(conn) -> list[dict]:
    """Rebuild the stats, propose each active question now far off its level that was never proposed that way (under
    the key it has now or one it had then), and → the proposals no one has decided yet, oldest first. A proposal is a
    row of the one proposal list (`curriculum_proposal`, kinds `mislevelled` and `new_mistake`)."""
    item_stats(conn)
    high, run = _bar(conn, HIGH), uuid.uuid4()
    conn.execute(
        "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, proposer, machine)"
        " select i.tenant_id, %s, 'mislevelled', i.item_key, jsonb_build_object('direction', d.direction,"
        "        'evidence', jsonb_build_object('n', s.n, 'correct', round(s.n * s.p_correct),"
        "        'p_correct', s.p_correct, 'difficulty', i.difficulty, 'skill_set_code', i.skill_set_code)),"
        "        'needs_person', 'code', 'code:mislevelled'"
        " from item_stat s join item i on i.id = s.item_id"
        " cross join lateral (select case when s.p_correct > %s then 'easier' else 'harder' end as direction) d"
        " where s.flagged_mislevelled and i.status = 'active' and not exists ("
        "   select 1 from curriculum_proposal p where p.tenant_id = i.tenant_id and p.kind = 'mislevelled'"
        "   and p.about is null and p.proposal ->> 'direction' = d.direction and (p.subject_code = i.item_key"
        "   or p.subject_code in (select k.before ->> 'item_key' from change_log k where k.tenant_id = i.tenant_id"
        "     and k.table_name = 'item' and k.row_id = i.id::text and k.op = 'rekey')))",  # ADR 0053
        (run, high),
    )
    learned.propose(
        conn, run
    )  # rules children's unexplained answers point to (goals/s22-learned-mistakes.yaml)
    return conn.execute(
        "select p.id, p.kind, p.subject_code as subject, p.proposal ->> 'direction' as direction,"
        " p.proposal -> 'evidence' as evidence, p.created_at from curriculum_proposal p"
        " where p.kind = any(%s) and p.about is null"
        " and not exists (select 1 from curriculum_proposal d where d.about = p.id)"
        " order by p.created_at, p.subject_code",
        (list(VERDICTS),),
    ).fetchall()


# the verdicts a person may give each kind of the bank's proposals, and where each leaves the proposal: done, or not
VERDICTS = {"mislevelled": ("remove", "keep"), "new_mistake": ("adopt", "reject")}
DONE = ("remove", "adopt")


def decide(conn, proposal_id, verdict, by, note="") -> dict:
    """A person decides a proposal, once. A question far off its level: `remove` takes it out of the bank (its
    worksheets are rebuilt in the same transaction), `keep` leaves it. A mistake learned from children's answers:
    `adopt` names it (`note` is its name) and it is recognised from then on, `reject` leaves it unknown. `by` is the
    sign-in email of a member of staff; the decision names them by their id. Raises ValueError for someone not on the
    staff list, a proposal already decided or a verdict that is not one of its kind's."""
    if not by:
        raise ValueError("a decision names the person deciding")
    p = conn.execute(
        "select id, tenant_id, kind, subject_code as subject, proposal ->> 'direction' as direction,"
        " proposal -> 'evidence' as evidence from curriculum_proposal"
        " where id = %s and about is null and kind = any(%s)",
        (proposal_id, list(VERDICTS)),
    ).fetchone()
    if not p:
        raise LookupError(f"no proposal {proposal_id}")
    staff = signer.lookup(conn, by)
    if staff is None:
        raise ValueError(
            f"{by!r} is not the sign-in email of a member of staff: a decision is a member of staff's"
        )
    if verdict not in VERDICTS[p["kind"]]:
        raise ValueError(
            f"a {p['kind']} proposal is decided {' or '.join(VERDICTS[p['kind']])}, not {verdict!r}"
        )
    if conn.execute("select 1 from curriculum_proposal where about = %s", (proposal_id,)).fetchone():
        raise ValueError("this proposal is already decided")
    code = learned.adopt(conn, p, note) if verdict == "adopt" else None
    if verdict == "remove":
        e = p["evidence"]
        why = note or f"far {p['direction']} than {e['difficulty']}: {e['correct']} of {e['n']} right"
        question.remove(conn, p["subject"], by, why)
    conn.execute(
        "insert into curriculum_proposal (tenant_id, about, run_id, kind, subject_code, status, reason, staff_id)"
        " select tenant_id, id, run_id, kind, subject_code, %s, %s, %s from curriculum_proposal where id = %s",
        ("applied" if verdict in DONE else "rejected", note, staff, proposal_id),
    )
    return {
        "proposal_id": proposal_id,
        "subject": p["subject"],
        "verdict": verdict,
        "code": code,
        "staff_id": staff,
    }
