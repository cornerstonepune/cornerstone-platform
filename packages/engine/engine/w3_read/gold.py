"""W3's gold: Aseem's five Grade 3 reports, read back against each child's graph (ADR 0028).

His reports are the target output of the whole pipeline, written by hand. Each finding is one case
of the one eval set (`eval_case`, kind `report_finding`): a concept he called strong or faulty for
one child, the question on the child's own papers that shows it where there is one, the answer he
quotes, and the named mistake where his words name a method the vocabulary holds. A person confirms the transcription before the check trusts it.

"In the graph" means in what the graph is built from: the child's confirmed evidence on that skill,
from a reading nobody has superseded. Whether the graph also calls it a pattern — the same mistake
twice on one rung — is reported beside it and not required: a report that quotes one example is not
evidence of two.
"""

import json
from collections import Counter
from pathlib import Path

from psycopg.types.json import Jsonb

from engine.w3_read import marking

WAITING = ("needs_teacher", "unreadable")
# what a finding says beyond its child, verdict, skill and question: its case's detail, from the file's names
DETAIL = {"expect_mark": "mark", "child_answer": "answer", "misconception_code": "mistake", "words": "words"}


def load(conn, path, actor="engine-cli") -> int:
    """The transcription → rows. The file names each child by first name, as the reports do, and lives
    beside the reports, outside the repository (rule 6): the name is looked up in `pii` here and only
    the id is stored. Loading the same file twice changes nothing; changing a finding withdraws its
    confirmation, so a confirmation always refers to the words that are live."""
    spec = json.loads(Path(path).expanduser().read_text())
    for f in spec["findings"]:
        kids = conn.execute(
            "select c.tenant_id, c.id as child_id from pii.find_child(null, %s, %s) f join child c on c.id = f",
            (f["child"], actor),
        ).fetchall()
        if len(kids) != 1:
            raise ValueError(f"{len(kids)} children are named {f['child']!r}; a finding names exactly one")
        record(conn, kids[0]["tenant_id"], kids[0]["child_id"], f, spec["source"])
    return len(spec["findings"])


def record(conn, tenant, child_id, f, source) -> None:
    """One finding as a case of the eval set: the child's id, never a name. The same finding again changes nothing;
    changed words, mark, answer or mistake withdraw its confirmation."""
    detail = {
        k: None if f.get(v) is None else str(f[v]) for k, v in DETAIL.items()
    }  # as text, as a column was
    conn.execute(
        "insert into eval_case (tenant_id, kind, child_id, verdict, skill_code, ref, source, detail)"
        # a file written before a key changed names the old one
        " values (%s, 'report_finding', %s, %s, %s, public.current_item_key(%s), %s, %s)"
        " on conflict (tenant_id, child_id, verdict, skill_code, ref) where kind = 'report_finding' do update set"
        " detail = eval_case.detail || excluded.detail, source = excluded.source,"
        " confirmed_by = case when eval_case.detail @> excluded.detail then eval_case.confirmed_by end",
        (tenant, child_id, f["verdict"], f["skill"], f.get("item"), source, Jsonb(detail)),
    )


def confirm(conn, by) -> int:
    """A person says the transcription is what the reports say. Only rows not yet confirmed change."""
    return conn.execute(
        "update eval_case set confirmed_by = %s where kind = 'report_finding' and confirmed_by is null", (by,)
    ).rowcount


def check(conn, actor="engine-cli") -> list[dict]:
    """Every finding, with where it stands between the child's page and the child's graph."""
    rows = conn.execute(
        """
        select g.child_id, p.first_name, g.verdict, g.skill_code, g.item_key, g.expect_mark,
               g.child_answer, g.misconception_code, g.confirmed_by, r.id as result_id, r.status,
               coalesce(r.misconception_codes, '{}') as codes,
               coalesce((select rc.human_read from read_correction rc
                          where rc.item_result_id = r.id and rc.judged is null
                          order by rc.created_at desc limit 1),
                        r.raw_read::jsonb ->> 'child_answer') as answer,
               exists (select 1 from evidence_event e
                        where e.item_result_id = r.id and e.confirmed_by is not null) as signed_off,
               (select count(*) from item_result r3 join item i3 on i3.id = r3.item_id
                  join capture c3 on c3.id = r3.capture_id and c3.superseded_by is null
                  join sheet_instance s3 on s3.id = c3.sheet_instance_id
                 where s3.child_id = g.child_id
                   and g.skill_code = any(case when i3.source = 'generated' then i3.skill_codes
                        else array[coalesce(i3.spec ->> 'skill', i3.skill_codes[1])] end)) as on_papers,
               (select count(*) from evidence_placed e left join item_result r2 on r2.id = e.item_result_id
                  left join capture c2 on c2.id = r2.capture_id
                 where e.child_id = g.child_id and e.skill_code = g.skill_code
                   and e.confirmed_by is not null and (c2.id is null or c2.superseded_by is null)) as in_graph,
               coalesce((select array_agg(distinct s.repeating_misconception) from child_skill_state s
                          where s.kind = 'written' and s.child_id = g.child_id and s.skill_code = g.skill_code
                            and s.repeating_misconception is not null), '{}') as patterns
        from (select child_id, verdict, skill_code, ref as item_key, detail ->> 'expect_mark' as expect_mark,
                     detail ->> 'child_answer' as child_answer, detail ->> 'misconception_code' as misconception_code,
                     confirmed_by
              from eval_case where kind = 'report_finding') g
        cross join lateral pii.read_child(g.child_id, %s) p
        left join lateral (
          select r.* from item_result r join item i on i.id = r.item_id
            join capture c on c.id = r.capture_id and c.superseded_by is null
            join sheet_instance si on si.id = c.sheet_instance_id
           where si.child_id = g.child_id and i.item_key = g.item_key
           order by r.created_at desc limit 1) r on true
        order by p.first_name, g.verdict, g.skill_code, g.item_key
        """,
        (actor,),
    ).fetchall()
    return [{**r, "outcome": outcome(r)} for r in rows]


def outcome(r) -> str:
    """The first thing standing between this finding and the graph — or "in the graph"."""
    if not r["confirmed_by"]:
        return "transcription not yet confirmed"
    if r["verdict"] == "strong":
        if not r["on_papers"]:
            return "not in the papers"
        if not r["in_graph"]:
            return "not yet signed off"
        return "called faulty" if r["patterns"] else "in the graph"
    if r["result_id"] is None:
        return "not in the papers"
    if r["status"] in WAITING:
        return "waiting for a person"
    if r["child_answer"] and marking.normalise_answer(r["answer"] or "") != marking.normalise_answer(
        r["child_answer"]
    ):
        return "read differently"
    if r["expect_mark"] and r["status"] != r["expect_mark"]:
        return "marked differently"
    if r["misconception_code"] and r["misconception_code"] not in r["codes"]:
        return "mistake not named"
    if not r["signed_off"]:
        return "not yet signed off"
    return "in the graph"


def summary(results) -> tuple[str, bool]:
    """(the counts in one line, whether every finding the papers hold is in the graph)."""
    held = [r for r in results if r["outcome"] != "not in the papers"]
    counts = Counter(r["outcome"] for r in results)
    ok = bool(held) and all(r["outcome"] == "in the graph" for r in held)
    return " · ".join(f"{n} {k}" for k, n in counts.most_common()), ok
