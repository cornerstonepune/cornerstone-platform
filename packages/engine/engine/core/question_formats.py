"""Kinds of question: from supabase/seed/question_formats.json (ADR 0075), each kept on its skill set's row
(`skill.question_kinds` {code: kind}; CP-27 group 6: once the table `question_format`). A kind is drafted once by the
seed and is the educators' after that, as a skill set is: a load adds the kinds a skill set does not have and never
overwrites one. A code names one kind in the school: a load refuses a code another skill set already holds.
The question types (B2, supabase/seed/question_types.json) are kinds of question too, and load here."""

import json
from collections.abc import Callable
from typing import Any

from engine.core import db


def load(conn: db.Conn, tenant: db.Id, seed: Callable[[str, str], Any]) -> None:
    for k in seed("question_formats.json", "question_formats"):
        elsewhere = conn.execute(
            "select code from skill where tenant_id = %s and code <> %s and question_kinds ? %s",
            (tenant, k["skill_set"], k["code"]),
        ).fetchone()
        if elsewhere:
            raise ValueError(f"the kind {k['code']} is already {elsewhere['code']}'s: a code names one kind")
        conn.execute(
            "update skill set question_kinds = question_kinds || jsonb_build_object(%s::text, %s::jsonb)"
            " where tenant_id = %s and code = %s and not question_kinds ? %s",
            (k["code"], json.dumps(k, ensure_ascii=False), tenant, k["skill_set"], k["code"]),
        )


def load_types(conn: db.Conn, tenant: db.Id, seed: Callable[[str, str], Any]) -> None:
    """Each question type's words, how it reaches the child and how it is marked (B2), in one statement, so the levels'
    links are made once. A type the seed does not name is left as it is; a new one waits for the coordinator."""
    conn.execute(
        "insert into question_type (tenant_id, code, fmt, words, reaches, marked, own_words)"
        " select %s, x.code, x.fmt, x.words, x.reaches, x.marked::eval_type[], x.own_words from jsonb_to_recordset(%s::jsonb)"
        "   x(code text, fmt text, words text, reaches text, marked text[], own_words boolean)"
        " on conflict (tenant_id, code) do update set fmt = excluded.fmt, words = excluded.words,"
        " reaches = excluded.reaches, marked = excluded.marked, own_words = excluded.own_words"
        " where row(question_type.fmt, question_type.words, question_type.reaches, question_type.marked,"
        " question_type.own_words) is distinct from row(excluded.fmt, excluded.words, excluded.reaches,"
        " excluded.marked, excluded.own_words)",
        (tenant, json.dumps(seed("question_types.json", "question_types"))),
    )
