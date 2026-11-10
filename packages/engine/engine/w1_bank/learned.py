"""Mistakes learned from children's answers (goals/s22-learned-mistakes.yaml). Nimish, 2026-09-28: "Whenever there is
an answer that the student writes which is not found in the answer list, the system should create that as a mistake
so that next time, when a child does that, that is found."

The examples are wrong answers a person has confirmed on a two-number sum that no named mistake explains (and that no
person named from the list). For each, code finds every column rule that reproduces it (`assess/learned_rules.py`). A
rule that reproduces such answers on at least `mistake.learn_min_questions` different questions is a way of working,
not a slip: it is proposed once, with its examples and its description in words (a row of the one proposal list,
`curriculum_proposal`, kind new_mistake).
A person adopts it under a name of their choosing — it joins the vocabulary (`misconception`) and is recognised on
every question it can occur on (`recognise`, used by marking) — or rejects it. The rule is kept on the named mistake
itself (`misconception.learned_rule`, with the proposal it came from), which a load of the seed never touches.
"""

import hashlib
import json

from engine.assess import learned_rules as L
from engine.core import db, settings

MIN = ("mistake.learn_min_questions", 2)


def _least(conn):
    return int(settings.threshold(conn, *MIN))


def unexplained(conn) -> list[dict]:
    """Every confirmed wrong answer on a two-number + or − question that carries no named mistake and that no person
    named from the list: {op, a, b, wrote, item_key, result_id}. The child's answer is the latest a person typed, else
    the reader's reading they signed off."""
    rows = conn.execute(
        "with typed as (select distinct on (item_result_id) item_result_id, human_read from read_correction"
        "               where judged is null order by item_result_id, created_at desc)"
        " select r.id as result_id, i.item_key, i.spec, result_response(i.responses, r.rid) as response,"
        "        i.spec ->> 'op' as op, (i.spec ->> 'a') as a, (i.spec ->> 'b') as b,"
        "        coalesce(t.human_read, r.raw_read::jsonb ->> 'child_answer', '') as wrote"
        " from item_result r join item i on i.id = r.item_id join capture c on c.id = r.capture_id"
        " left join typed t on t.item_result_id = r.id"
        # the mistake a person last named on the answer, on whichever reading (`naming.name_mistake`)
        " left join lateral (select e.value ->> 'code' as code from jsonb_each(r.named_mistakes) e"
        "   order by (e.value ->> 'at')::timestamptz desc limit 1) n on true"
        " where r.state = 'confirmed' and r.status = 'wrong' and cardinality(r.misconception_codes) = 0"
        "   and c.superseded_by is null and i.spec ->> 'op' in ('+', '-') and i.spec ? 'a' and i.spec ? 'b'"
        "   and coalesce(n.code, 'NONE') = 'NONE'"
    ).fetchall()
    out = []
    for r in rows:
        wrote = "".join(ch for ch in r["wrote"] if ch.isdigit())
        # only a wrong answer to the sum itself is a way of working it; its estimate or a check of it is not
        if wrote and L.works_the_sum(r.pop("spec"), r.pop("response") or {}):
            out.append({**r, "a": int(r["a"]), "b": int(r["b"]), "wrote": int(wrote)})
    return out


def candidates(examples, least):
    """[(rule, [examples it explains])], each rule explaining answers on at least `least` different questions, the
    widest and simplest first — and a rule whose answers another already kept explains is not offered again."""
    explains = {}
    for e in examples:
        for rule in L.explaining(e["op"], e["a"], e["b"], e["wrote"]):
            explains.setdefault(L.rule_id(rule), (rule, []))[1].append(e)
    wide = [
        (rule, found)
        for rule, found in explains.values()
        if len({(e["op"], e["a"], e["b"]) for e in found}) >= least
    ]
    wide.sort(key=lambda rf: (-len(rf[1]), L.cost(rf[0]), L.rule_id(rf[0])))
    kept, covered = [], []
    for rule, found in wide:
        ids = {e["result_id"] for e in found}
        if any(ids <= seen for seen in covered):
            continue
        kept.append((rule, found))
        covered.append(ids)
    return kept


def propose(conn, run) -> int:
    """Each rule children's unexplained answers point to, proposed once, as part of the run `run`. → how many were
    new."""
    new = 0
    for rule, found in candidates(unexplained(conn), _least(conn)):
        subject = L.rule_id(rule)
        if conn.execute(
            "select 1 from curriculum_proposal where kind = 'new_mistake' and about is null and subject_code = %s",
            (subject,),
        ).fetchone():
            continue
        examples = [{k: e[k] for k in ("op", "a", "b", "wrote", "item_key")} for e in found]
        conn.execute(
            "insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, proposer,"
            " machine) select id, %s, 'new_mistake', %s, jsonb_build_object('direction', %s::text, 'evidence',"
            " %s::jsonb), 'needs_person', 'code', 'code:new_mistake' from tenant where slug = %s",
            (
                run,
                subject,
                rule["op"],
                json.dumps({"rule": rule, "words": L.words(rule), "examples": examples}),
                db.tenant_slug(),
            ),
        )
        new += 1
    return new


def code_for(rule) -> str:
    """The same rule is always the same code."""
    return "L_" + hashlib.md5(L.rule_id(rule).encode()).hexdigest()[:6].upper()


def adopt(conn, proposal, name) -> str:
    """A person names a proposed rule and adopts it: it joins the vocabulary, its rule kept on it, and is recognised
    from now on. Who adopted it is the decision's (`learn.decide`). → code."""
    if not name.strip():
        raise ValueError("an adopted mistake is named by the person adopting it")
    rule = proposal["evidence"]["rule"]
    code = code_for(rule)
    conn.execute(
        "insert into misconception (tenant_id, code, op, name, description, repair_hint, detectable_by, source,"
        " skill_from, learned_rule, learned_from) values (%s,%s,%s,%s,%s,'','answer_lookup',%s,'operation',%s,%s)",
        (proposal["tenant_id"], code, rule["op"], " ".join(name.split()), L.words(rule),
         f"learned from children's answers (proposal {proposal['id']})", json.dumps(rule), proposal["id"]),
    )  # fmt: skip
    return code


def rules(conn) -> list[tuple[str, dict]]:
    """Every adopted mistake as (code, rule)."""
    return [
        (r["code"], r["learned_rule"])
        for r in conn.execute(
            "select code, learned_rule from misconception where learned_rule is not null order by created_at, code"
        )
    ]


def recognise(learned, op, a, b, wrote) -> list[str]:
    """The adopted mistakes that give exactly `wrote` for `a op b`."""
    return sorted(code for code, rule in learned if rule["op"] == op and L.predict(rule, a, b) == wrote)
