"""Referential checks the schema cannot express, because the codes live in arrays: every code a seeded row names is a
row itself, and no two bands of one skill set claim one region. Read once the rows are loaded (`engine load`, `engine
audit`); split from `loaders.py`, which loads them."""

from engine.core import db


def orphans() -> dict[str, list[str]]:
    """Referential checks the schema cannot express, because the codes live in arrays."""
    with db.connect() as conn:
        return {
            "skill registry codes missing from the registry": [
                r["s"]
                for r in conn.execute(
                    "select distinct s from skill, unnest(registry_codes) s"
                    " where not exists (select 1 from registry_skill k where k.code = s)"
                ).fetchall()
            ],
            # the skill a question's results count (its own, else its skill's first): a registry skill. The rows that
            # kept it as a key (`item_registry_skill`) were a copy of this, retired by CP-27.
            "question skills missing from the registry": [
                r["s"]
                for r in conn.execute(
                    "select distinct coalesce(i.spec ->> 'skill', i.skill_codes[1]) as s from item i"
                    " where not exists (select 1 from registry_skill k where k.tenant_id = i.tenant_id"
                    " and k.code = coalesce(i.spec ->> 'skill', i.skill_codes[1]))"
                ).fetchall()
            ],
            "level_rule rungs missing from the ladder": [
                r["s"]
                for r in conn.execute(
                    "select distinct s from level_rule, unnest(rung_codes) s"
                    " where not exists (select 1 from skill g where g.rung_code = s)"
                ).fetchall()
            ],
            "skill_set misconception codes missing from the vocabulary": [
                r["s"]
                for r in conn.execute(
                    "select distinct s from skill, unnest(misconception_codes) s"
                    " where not exists (select 1 from misconception m where m.code = s)"
                ).fetchall()
            ],
            # Two bands with one region compete for one pool of items and starve each other
            # (BUILD-ORDER gate 4, amended). A band's region is its `check`; equal checks fail. A level with no check
            # draws from no pool (English's are not drawn from a bank), so it has no region to share.
            "skill_set bands sharing one region": [
                f"{r['code']} {r['bands']}"
                for r in conn.execute(
                    "select skill_code as code, string_agg(difficulty, '=' order by difficulty) as bands from ("
                    "  select skill_code, difficulty, rule->'check' as region from skill_level where rule ? 'check') x"
                    " group by code, region having count(*) > 1 order by code"
                ).fetchall()
            ],
        }
