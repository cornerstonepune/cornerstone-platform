"""The K2 voice-note switches, turned by a command that names who turned them (task M1-04): never by hand on live.

`voice.screens_enabled` shows the K2 educator What needs doing's K2 rows, the form and Confirm. `voice.recording_enabled`
lets her record and hear a note back, on top of the screens. `voice.sarvam_no_retention_confirmed` records that
Sarvam's written "No retention" (D-065) is in hand; it is a record and not a gate (CP-10): recording works with it
false, and turning it on needs the written reference. Each turn is written to `access_log` under the signer's staff id
(as a people load is signed, `core/signer.py`), with the reference when there is one; nothing prints an email.
"""

from engine.core import db, settings, signer

KEYS = {
    "screens": "voice.screens_enabled",
    "recording": "voice.recording_enabled",
    "sarvam": "voice.sarvam_no_retention_confirmed",
}
NO_REFERENCE = (
    "not recorded: give --ref, the reference of Sarvam's written confirmation that the school's workspace keeps no"
    " recording (D-065)"
)


def switch(conn: db.Conn, which: str, on: bool, by: str, retention_ref: str | None = None) -> str:
    """Turn one switch, signed by `by` (the email they sign in with) → what changed, in words with no email."""
    key = KEYS.get(which)
    if key is None:
        raise ValueError(f"no such switch: say {' or '.join(KEYS)}")
    ref = (retention_ref or "").strip()
    if which == "sarvam" and on and not ref:
        raise ValueError(NO_REFERENCE)
    who = signer.resolve(conn, by)
    was = settings.config(conn, key, False) is True
    conn.execute(
        "insert into config (tenant_id, key, value, description) select id, %s, %s::jsonb, %s from tenant"
        " on conflict (tenant_id, key) do update set value = excluded.value",
        (key, "true" if on else "false", f"set by `engine read voice switch {which}`"),
    )
    action = f"{key} {'on' if on else 'off'}" + (f", ref: {ref}" if ref and on else "")
    conn.execute(
        "insert into access_log (tenant_id, actor, action, occurred_at) select id, %s, %s, clock_timestamp() from tenant",
        (who, action),
    )
    return f"{key}: {'on' if on else 'off'} (was {'on' if was else 'off'}); logged"


def status(conn: db.Conn) -> list[str]:
    """The voice switches, Sarvam's recorded setting and the last clean-up run, in words with no name and no count of
    anything but recordings."""
    on = lambda key: "on" if settings.config(conn, key, False) is True else "off"  # noqa: E731
    last = conn.execute(
        "select status, finished_at, result from flow_run where flow = 'voice_cleanup' order by started_at desc limit 1"
    ).fetchone()
    done = (
        "none yet"
        if last is None
        else f"{last['finished_at']:%Y-%m-%d %H:%M}: {last['status']}, "
        + (
            f"{(last['result'] or {}).get('recordings', 0)} recordings deleted"
            if last["status"] == "ok"
            else "failed"
        )
    )
    sarvam = "confirmed" if settings.config(conn, KEYS["sarvam"], False) is True else "not confirmed"
    return [
        f"screens: {on(KEYS['screens'])}",
        f"recording: {on(KEYS['recording'])}",
        f"Sarvam no-retention: {sarvam}",
        f"last clean-up: {done}",
    ]
