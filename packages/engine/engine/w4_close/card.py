"""N11 — Friday's class card (goals/w4a-class-card.yaml), computed from each child's graph alone; no model.

For every skill set the section's children have checked evidence on: the children in the graph's own groups — ready to
move up, secure, practising, emerging, reteach (grouped by the named mistake each repeats), not enough evidence yet.
For every child: the area their home paper will work on, exactly as W2 makes it (`focus_paper.home_area`). A child
with no checked evidence is named as such, never dropped. The card is built from the graph whenever it is asked for and
never stored (CP-27 group 4: the old `class_card` rows only copied it); the educator confirms it once, by name, and
what they confirmed is kept as they saw it (an `approval` row).
"""

import json

from engine.core import db, mistake_names, vocabulary
from engine.w2_print import focus_paper

BY_MISTAKE = "reteach"  # the card's group whose children are grouped by the named mistake each repeats


def groups(states):
    """({state: its group on the card}, the groups in the card's order) from the states' rows (ADR 0086): strongest
    first, "not enough evidence yet" last."""
    order = sorted(states, key=lambda s: (not s["enough"], -s["ord"]))
    group = {s["code"]: s["card_group"] or s["code"] for s in states}  # no group named: a group of its own
    return group, tuple(dict.fromkeys(group[s["code"]] for s in order))


def _weakest(states, rank):
    """{(rung, child): the child's weakest state on that rung} — a child sits once in a skill set's groups, where they
    are weakest; "not enough yet" only when nothing on the rung has enough evidence."""
    out = {}
    for s in sorted(states, key=lambda s: rank[s["state"]]):
        out.setdefault((s["rung_code"], str(s["child_id"])), s)
    return out


def _children(conn, section):
    return conn.execute(
        "select id, roll_no, band from child_now where section = %s and active order by roll_order(roll_no), roll_no",
        (section,),
    ).fetchall()


def build(conn, section):
    """→ {"section", "skills": [{skill_set, name, rung, groups}], "children": [{child_id, roll_no, home, why}]}."""
    kids = _children(conn, section)
    if not kids:
        raise ValueError(f"no class {section!r}")
    ids = [k["id"] for k in kids]
    states = conn.execute(
        "select child_id, skill_code, rung_code, state, n_events, n_correct, repeating_misconception"
        " from child_skill_state where child_id = any(%s)",
        (ids,),
    ).fetchall()
    sets = {
        r["rung_code"]: r
        for r in conn.execute(
            "select code, name, rung_code from skill where status is distinct from 'retired'"
        )
    }
    name_of = mistake_names.names(conn)
    rows = vocabulary.states(conn)
    group_of, order = groups(rows)

    by_rung = {}
    for (rung, who), s in _weakest(states, {r["code"]: r["ord"] for r in rows}).items():
        g = by_rung.setdefault(rung, {k: [] for k in order if k != BY_MISTAKE} | {BY_MISTAKE: {}})
        if group_of[s["state"]] == BY_MISTAKE:
            code = s["repeating_misconception"]
            g[BY_MISTAKE].setdefault(code, {"name": name_of(code, skill=s["skill_code"]), "children": []})[
                "children"
            ].append(who)
        else:
            g[group_of[s["state"]]].append(who)
    skills = [
        {
            "skill_set": sets[r]["code"] if r in sets else None,
            "name": sets[r]["name"] if r in sets else r,
            "rung": r,
            "groups": by_rung[r],
        }
        for r in sorted(by_rung, key=lambda r: (sets[r]["code"] if r in sets else "~", r))
    ]

    seen = {str(s["child_id"]) for s in states}
    children = []
    for k in kids:
        who = str(k["id"])
        if who not in seen:
            children.append(
                {"child_id": who, "roll_no": k["roll_no"], "home": None, "why": "no checked paper yet"}
            )
            continue
        mine = [s for s in states if str(s["child_id"]) == who]
        area = next(iter(focus_paper.home_area(conn, k["id"], mine)), None)
        children.append(
            {
                "child_id": who,
                "roll_no": k["roll_no"],
                "home": area
                and {
                    "skill_set": area.skill_set,
                    "level": area.level,
                    "mistake": area.mistake,
                    "mistake_name": name_of(area.mistake, skill=area.skill_code) if area.mistake else None,
                    "state": area.state,
                    "right": area.right,
                    "answered": area.answered,
                },
                "why": "" if area else "nothing lags and nothing to stretch into in the bank",
            }
        )
    return {"section": section, "skills": skills, "children": children}


def confirm(conn, section, week, by, card):
    """The educator confirms the week's card, by name; kept as they saw it (append-only; the latest stands)."""
    if not by:
        raise ValueError("a confirmation names the educator making it")
    return db.one(  # an approval row of the class's week (CP-27), the card as they saw it in `detail`
        conn,
        "insert into approval (tenant_id, kind, target, decision, by, detail, created_at)"
        " select id, 'class_card', %s || ' ' || %s, 'confirmed', %s,"
        " jsonb_build_object('section', %s::text, 'week', %s::text, 'card', %s::jsonb), clock_timestamp()"
        " from tenant where slug = %s returning id, created_at",
        (section, week, by, section, week, json.dumps(card), db.tenant_slug()),
    )


def confirmed(conn, section, week):
    return conn.execute(
        "select by, detail -> 'card' as card, created_at from approval where kind = 'class_card'"
        " and tenant_id = (select id from tenant where slug = %s) and target = %s || ' ' || %s"
        " order by created_at desc, seq desc limit 1",
        (db.tenant_slug(), section, week),
    ).fetchone()
