"""The rows the engine reads as settings — prompts, thresholds, config — each upserted from its seed. Every deploy
loads them (`engine load --settings`, deploy-engine.yml), so a setting merged with the code that reads it is live with
that code; `loaders.load_all` loads them with everything else. Split from `loaders.py` on 2026-09-29, when a prompt row
gained its model's effort and the loader stood at its frozen ceiling.
"""

import json
from typing import Any, LiteralString

from engine.core import db

SEED = db.REPO_ROOT / "supabase" / "seed"


def seed(name: str, key: str) -> Any:
    return json.loads((SEED / name).read_text())[key]


def load_prompts(conn: db.Conn, t: db.Id) -> None:
    for p in seed("prompts.json", "prompts"):
        text = (SEED / p["text_file"]).read_text() if p.get("text_file") else p["text"]
        conn.execute(
            "insert into prompt (tenant_id, purpose, version, text, model, json_schema, active, subject, effort)"
            " values (%s,%s,%s,%s,%s,%s,%s,%s,%s)"
            " on conflict (tenant_id, purpose, coalesce(subject, ''), version) do update set text=excluded.text,"
            " model=excluded.model, json_schema=excluded.json_schema, active=excluded.active,"
            " effort=excluded.effort, updated_at=now()",
            (
                t,
                p["purpose"],
                p["version"],
                text,
                p["model"],
                json.dumps(p["json_schema"]),
                p.get("active", False),
                p.get("subject"),
                p.get("effort"),  # how hard the model thinks; none is its own default (llm.EFFORTS)
            ),
        )


def load_thresholds(conn: db.Conn, t: db.Id) -> None:
    """The numbers (`thresholds.json`): config rows whose value is a number (CP-27: once the table `threshold`). A
    file row's `unit` is for its reader; nothing reads it from the database."""
    for r in seed("thresholds.json", "thresholds"):
        conn.execute(
            "insert into config (tenant_id, key, value, description) values (%s,%s,%s,%s)"
            " on conflict (tenant_id, key) do update set value=excluded.value, description=excluded.description,"
            " updated_at=now()",
            (t, r["key"], json.dumps(r["value"]), r["description"]),
        )


def load_config(conn: db.Conn, t: db.Id) -> None:
    """A row marked `seed_once` belongs to the app after its first load — `app.staff` holds the
    password hashes `engine set-password` writes, and re-seeding it took every one of them away."""
    for c in seed("config.json", "config"):
        on_conflict = (
            "do nothing"
            if c.get("seed_once")
            else "do update set value=excluded.value, description=excluded.description, updated_at=now()"
        )
        conn.execute(
            "insert into config (tenant_id, key, value, description) values (%s,%s,%s,%s)"
            f" on conflict (tenant_id, key) {on_conflict}",
            (t, c["key"], json.dumps(c["value"]), c.get("description", "")),
        )


def load(conn: db.Conn, t: db.Id) -> None:
    for step in (load_prompts, load_thresholds, load_config):
        step(conn, t)


# The school a reader without a school means: the engine's own (`db.tenant_slug()`), else the first there is. A new
# school copies every setting (internal.school_settings_on_new_school), so a key is often a row of several schools.
_OURS: LiteralString = (
    " from config c join tenant t on t.id = c.tenant_id"
    " where (%(tenant)s::uuid is null or c.tenant_id = %(tenant)s::uuid) and {where}"
    " order by t.slug = %(slug)s desc, t.created_at, t.id"
)


def _rows(conn: db.Conn, where: LiteralString, tenant: db.Id | None, **params: Any) -> list[Any]:
    return conn.execute(
        "select c.key, c.value" + _OURS.format(where=where),
        {"tenant": tenant, "slug": db.tenant_slug(), **params},
    ).fetchall()


def config(conn: db.Conn, key: str, default: Any = None, tenant: db.Id | None = None) -> Any:
    """A setting's value, or `default` when there is no such row: the school's own when `tenant` is named, else the
    engine's school's. The one reader of `config` (CP-27, Done when 11)."""
    rows = _rows(conn, "c.key = %(key)s", tenant, key=key)
    return rows[0]["value"] if rows else default


def threshold(conn: db.Conn, key: str, default: float, tenant: db.Id | None = None) -> float:
    """A number setting's value, or `default` when there is no such row."""
    value = config(conn, key, None, tenant)
    return default if value is None else float(value)


def numbers(conn: db.Conn, prefix: str, tenant: db.Id | None = None) -> dict[str, float]:
    """Every number setting whose key starts with `prefix`, by the rest of its key: `numbers(conn, "watch.")`."""
    out: dict[str, float] = {}
    for r in _rows(
        conn, "starts_with(c.key, %(prefix)s) and jsonb_typeof(c.value) = 'number'", tenant, prefix=prefix
    ):
        out.setdefault(r["key"].removeprefix(prefix), float(r["value"]))
    return out


def many(conn: db.Conn, keys: list[str], tenant: db.Id | None = None) -> dict[str, Any]:
    """Several settings in one read, {key: value}; a key with no row is left out."""
    out: dict[str, Any] = {}
    for r in _rows(conn, "c.key = any(%(keys)s)", tenant, keys=keys):
        out.setdefault(r["key"], r["value"])
    return out


def every(conn: db.Conn, prefix: str, tenant: db.Id | None = None) -> dict[str, Any]:
    """Every setting whose key starts with `prefix`, by its whole key: `every(conn, "skills.")`."""
    out: dict[str, Any] = {}
    for r in _rows(conn, "starts_with(c.key, %(prefix)s)", tenant, prefix=prefix):
        out.setdefault(r["key"], r["value"])
    return out


def put(
    conn: db.Conn, key: str, value: Any, tenant: db.Id | None = None, description: str | None = None
) -> None:
    """A setting set to `value` for one school (the engine's own when none is named), made if it is not there. The
    caller commits."""
    conn.execute(
        "insert into config (tenant_id, key, value, description)"
        " select t.id, %(key)s, %(value)s::jsonb, coalesce(%(note)s, '') from tenant t"
        " where t.id = coalesce(%(tenant)s::uuid, (select id from tenant where slug = %(slug)s))"
        " on conflict (tenant_id, key) do update set value = excluded.value,"
        " description = coalesce(%(note)s, config.description), updated_at = now()",
        {
            "key": key,
            "value": json.dumps(value),
            "note": description,
            "tenant": tenant,
            "slug": db.tenant_slug(),
        },
    )


def lock(conn: db.Conn, key: str) -> None:
    """The setting's rows held for this transaction, so two writers of it take turns."""
    conn.execute("select 1 from config where key = %s for update", (key,))


def exposure_days(conn: db.Conn) -> int:
    """How long a question a child was given is held back from them: the `exposure.days` setting (SPEC: across
    weeks, no question a child saw in the last 21 days). The week's assembly and every paper drawn for a child read it
    here, so the window has one owner (goals/l5-seen-means-the-last-21-days.yaml)."""
    return int(threshold(conn, "exposure.days", 21))
