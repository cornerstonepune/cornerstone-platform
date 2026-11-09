"""Measure the harness itself: which components fired, and whether the repository is healthy.

Used by `athena scorecard`, `athena health` and the nightly health_issue.py. Standard library only.
Reads the component register (.claude/athena/components.json), the session transcripts under
$HOME/.claude/projects, the plan-usage files under $HOME/.athena/usage and usage/review-status.json.
"""
import io
import json
import os
import re
import statistics
import subprocess
import sys
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

MEASURED = ("skill", "agent", "plugin", "hook")  # kinds measured from transcripts, effect records or logs
IDLE_DAYS = 3  # ATH-9: Nimish hears about a silent component within 3 days
MAX_CLAUDE_MD, MAX_AGENTS_MD, MAX_HANDOFF, MAX_LESSONS = 200, 100, 50, 30
STUCK_DAYS, LEDGER_DAYS = 7, 7
STUCK_STATES = ("draft", "locked", "building", "blocked")
EGM_MIN_CLAUDE = "2.1.271"  # EGM v0.1.1 needs it (docs/research/audit-2026-11-07/design-stack.md, E9)


def now():
    return datetime.now(timezone.utc)


def parse_ts(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def read_json(p):
    try:
        return json.loads(Path(p).read_text())
    except (OSError, ValueError):
        return {}


# ---------------------------------------------------------------- register
def register(root):
    """The repo's installed register, else the one that ships next to this script."""
    for p in (Path(root) / ".claude" / "athena" / "components.json", Path(__file__).resolve().parent.parent / "components.json"):
        if p.exists():
            return read_json(p).get("components", []) + learned_skills(root)
    return learned_skills(root)


def learned_skills(root):
    """Skills autoharness learned in this repository: a skill folder carrying its .ledger.jsonl (ATH-21)."""
    return [{"kind": "skill", "name": f.parent.name, "learned": True, "idle_days": 30}
            for f in sorted((Path(root) / ".claude" / "skills").glob("*/.ledger.jsonl"))]


# ---------------------------------------------------------------- transcripts
def transcript_files(home):
    base = Path(home) / ".claude" / "projects"
    return sorted(base.glob("*/*.jsonl")) + sorted(base.glob("*/*/subagents/*.jsonl"))


def events(home):
    """One tuple per thing a session did: (kind, name, session, timestamp, tokens)."""
    return events_in(transcript_files(home))


PLUGIN_SKILL = re.compile(r"/plugins/([\w.-]+)/skills/([\w.-]+)/SKILL\.md$")


def events_in(files):
    out, seen, reads = [], set(), {}
    for f in files:
        for line in f.read_text(errors="replace").splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            ts, sid = parse_ts(row.get("timestamp")), row.get("sessionId") or f.stem
            att = row.get("attachment")
            if isinstance(att, dict) and str(att.get("type", "")).startswith("hook"):
                out.append(("hook", f"{att.get('hookName', '')} {att.get('command', '')}", sid, ts, 0))
                continue
            msg = row.get("message")
            if row.get("type") == "user" and isinstance(msg, dict):  # kept only to recognise a routine's run
                text = msg.get("content")
                text = text if isinstance(text, str) else " ".join(
                    p.get("text", "") for p in text or [] if isinstance(p, dict))
                out.append(("prompt", text[:4000], sid, ts, 0))
                # a slash command a person typed (e.g. /egm:egm-review, which the model cannot start) is a skill fire
                # (Claude Code writes such a message as the tags alone; a prompt that merely quotes them is not one)
                if text.lstrip().startswith("<command-"):
                    out += [("skill", n, sid, ts, 0) for n in re.findall(r"<command-name>/(\S+?)</command-name>", text)]
            if not isinstance(msg, dict) or not isinstance(msg.get("content"), list):
                continue
            u = msg.get("usage") or {}
            tokens = sum(int(u.get(k) or 0) for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens"))
            for part in msg["content"]:
                if not (isinstance(part, dict) and part.get("type") == "tool_use"):
                    continue
                inp = part.get("input") or {}
                tool = part.get("name", "")
                mid = msg.get("id")
                if mid and mid in seen:  # a message is written as several lines that repeat its usage: charge it once
                    tokens = 0
                seen.add(mid)
                if tool == "Skill":
                    out.append(("skill", str(inp.get("skill", "")), sid, ts, tokens))
                elif tool in ("Agent", "Task"):
                    out.append(("agent", str(inp.get("subagent_type", "")), sid, ts, tokens))
                elif tool.startswith("mcp__"):
                    out.append(("tool", tool, sid, ts, tokens))
                elif tool == "Read":
                    hit = PLUGIN_SKILL.search(str(inp.get("file_path", "")))
                    if hit:
                        reads.setdefault((sid, hit[1], hit[2]), ts)
    # A plugin skill the Skill tool refuses (EGM's) is run by reading its SKILL.md; it counts as fired once that
    # session also dispatches one of the same plugin's agents (the reviewers), so reading it alone does not count.
    agents = {(e[2], e[1].split(":")[0]) for e in out if e[0] == "agent" and ":" in e[1]}
    out += [("skill", f"{p}:{s}", sid, ts, 0) for (sid, p, s), ts in reads.items() if (sid, p) in agents]
    return out


def matches(comp, ev):
    kind, name = comp["kind"], comp["name"]
    ekind, ename = ev[0], ev[1]
    if kind == "skill":
        return ekind == "skill" and (ename == name or ename.endswith(":" + name))
    if kind == "agent":
        return ekind == "agent" and (ename == name or ename.endswith(":" + name))
    # ATH-21: a hook that merely ran (its command in the transcript) is not a fire; hooks and a plugin's hooks count
    # only from what they leave behind (evidence() below). A plugin's skill or tool that returned is its own effect.
    if kind == "plugin":
        return (ekind == "skill" and ename.startswith(name + ":")) or (ekind == "tool" and f"plugin_{name}" in ename)
    if kind == "task":  # a scheduled routine's prompt names its instruction file
        return ekind == "prompt" and f"routines/{name}.md" in ename
    return False


def review_status(root):
    return (read_json(Path(root) / "usage" / "review-status.json") or {}).get("reviews", {})


def collect(root, home):
    """component name -> {fired, sessions, tokens, last}. `last` is a datetime or None."""
    evs = events(home)
    reviews = review_status(root)
    rows = {}
    for c in register(root):
        hit = [e for e in evs if matches(c, e)] if c["kind"] in MEASURED else []
        last = max((e[3] for e in hit if e[3]), default=None)
        fired = len(hit)
        if c["kind"] == "task" and c["name"] in reviews:
            fired, last = 1, parse_ts(reviews[c["name"]].get("last_run"))
        if c.get("log_env"):  # a command-line tool's own log: one line per use (graphify's GRAPHIFY_QUERY_LOG)
            fired, last = log_lines(root, c["log_env"])
        rows[c["name"]] = {"kind": c["kind"], "fired": fired, "sessions": len({e[2] for e in hit}),
                           "tokens": sum(e[4] for e in hit), "last": last,
                           "idle_days": int(c.get("idle_days", IDLE_DAYS)), "measured": c["kind"] in MEASURED}
    return rows


def log_lines(root, var):
    """(lines, newest mtime) of the file the environment variable names, from the process or the repository's settings."""
    settings = read_json(Path(root) / ".claude" / "settings.json")
    p = os.environ.get(var) or (settings.get("env") or {}).get(var)
    try:
        f = Path(p).expanduser()
        return sum(1 for l in f.read_text(errors="replace").splitlines() if l.strip()), \
            datetime.fromtimestamp(f.stat().st_mtime, timezone.utc)
    except (OSError, TypeError):
        return 0, None


def has_records(home):
    return bool(transcript_files(home))


# ---------------------------------------------------------------- sessions, cloud and Mac
TELEMETRY = "athena-telemetry"  # a branch on origin with one small record per session: names and counts, never content
REF = f"refs/remotes/origin/{TELEMETRY}"


def source():
    if sys.platform == "darwin":
        return "mac"
    return "cloud" if any(k.startswith("CCR_") for k in os.environ) else "other"


def _git(root, *args, inp=None, env=None):
    return subprocess.run(["git", *args], cwd=root, input=inp, capture_output=True, text=True, env=env, timeout=60)


# ---------------------------------------------------------------- firing evidence (ATH-16)
# Claude Code records a hook in the transcript by a label ("command hook 1"), and a plugin's mod not at all, so the
# plugins and Athena's own hooks are seen by what they leave behind in this session. One detector per plugin; each
# names the file it reads. A plugin that leaves nothing when it lacks its key or CLI is "not observable", not silent.
SLACK = timedelta(minutes=2)  # a SessionStart hook can run just before the transcript's first timestamp
COMPACTION_LINE = ("fallback to built-in summary (", "messages, no summary (")  # fast-jev-compaction's own notice


def _rows(paths, key, sid, since):
    """True when a JSON line in one of the files (changed since `since`) has row[key] == sid."""
    for f in paths:
        try:
            if datetime.fromtimestamp(f.stat().st_mtime, timezone.utc) < since:
                continue
            for line in f.read_text(errors="replace").splitlines():
                if sid in line and json.loads(line).get(key) == sid:
                    return True
        except (OSError, ValueError, AttributeError):
            continue
    return False


def _fresh(path, since):
    try:
        return datetime.fromtimestamp(Path(path).stat().st_mtime, timezone.utc) >= since
    except OSError:
        return False


def _plugin_options(home, name):
    s = read_json(Path(home) / ".claude" / "settings.json")
    return ((s.get("pluginConfigs") or {}).get(name) or {}).get("options") or {}


def evidence(root, home, sid, started, transcript_text=""):
    """(fired, not_observable): plugin names with proof they ran in session `sid`, and those that cannot show it."""
    import hashlib
    import shutil
    root, home, since = Path(root), Path(home), started - SLACK
    data = home / ".claude" / "plugins" / "data"
    winnow = Path(os.environ.get("WINNOW_HOME") or home / ".winnow")
    fired, unseen = set(), set()
    if _rows(sorted((home / ".athena" / "usage").glob("*.jsonl")), "session", sid, since):
        fired.add("athena-mods")  # its ledger row for this session
    if any((root / ".claude" / "autoharness" / f).exists() for f in (f"session-{sid}.lock", f"offset-{sid}")):
        fired.add("autoharness")  # its per-session lock and transcript offset in the repository
    if any(data.glob(f"jev*/sessions/{sid}.json")):
        fired.add("jev")  # jevwire's per-session state
    mode = home / ".claude" / "ponytail-modes" / hashlib.sha256(os.path.normpath(str(root)).encode()).hexdigest()
    if _fresh(mode, since):
        fired.add("ponytail")  # written by its SessionStart hook, per project
    if (winnow / "notified" / sid).exists() or _rows([winnow / "decisions.jsonl"], "session_id", sid, since):
        fired.add("winnow")  # the sidecar handled a hook of this session
    if _rows([home / ".toolgate" / "audit.jsonl"], "session_id", sid, since):
        fired.add("toolgate")  # the CLI's audit line for a tool call of this session
    elif not (shutil.which("toolgate") or Path(str(_plugin_options(home, "toolgate").get("binary", ""))).is_file()):
        unseen.add("toolgate")  # without its CLI the mod only shows a toast
    if any(m in line for line in transcript_text.splitlines() if '"type":"user"' not in line.replace(" ", "")
           and '"type":"assistant"' not in line.replace(" ", "") for m in COMPACTION_LINE):
        fired.add("fast-jev-compaction")  # its notice after a compaction
    if _rows([home / ".canny" / "sessions" / f"claude-{sid}.jsonl"], "type", "event", since):
        fired.add("canny-done-gate")  # Canny's own ledger: one file per session, one line per hook event it recorded
    for f in (root / ".athena" / "fired" / sid).glob("*"):
        fired.add(f"athena-hook-{f.name}")  # Athena's own hooks leave a marker once they have done their work
    return fired, unseen - fired


def session_record(root, transcript, sid, rtk_saved=0, home=None):
    path = Path(transcript) if transcript else None
    evs = events_in([path]) if path and path.exists() else []
    names = {c["name"] for c in register(root) if c["kind"] in MEASURED + ("task",)}
    fired = {c["name"] for c in register(root) if c["kind"] in MEASURED + ("task",)
             for e in evs if matches(c, e)}
    started = min((e[3] for e in evs if e[3]), default=None) or now()
    text = path.read_text(errors="replace") if path and path.exists() else ""
    seen, unseen = evidence(root, home or Path.home(), sid, started, text)
    prev = read_json(Path(root) / ".athena" / "sessions" / f"{sid}.json")  # Stop runs every turn: keep what earlier turns saw
    if rtk_saved > 0:
        seen.add("rtk-hook")  # rtk's native hook rewrote commands and its own tracker recorded what that saved
    fired |= (seen & names) | set(prev.get("fired", []))
    models, subagents = session_models(path) if path and path.exists() else ({}, [])
    return {"id": sid, "kind": "session", "source": source(), "started_at": started.isoformat(),
            "ended_at": now().isoformat(), "fired": sorted(fired), "not_observable": sorted((unseen & names) - fired),
            "tokens": sum(e[4] for e in evs), "rtk_saved": int(rtk_saved), "models": models, "subagents": subagents}


def catch_up(root, home, skip, days=2):
    """Evidence that lands after a session's last Stop (athena-mods writes its ledger row and autoharness its offset
    when the turn completes): add it to this machine's recent session records. Called from the Stop hook."""
    names = {c["name"] for c in register(root) if c["kind"] in MEASURED + ("task",)}
    for f in (Path(root) / ".athena" / "sessions").glob("*.json"):
        rec = read_json(f)
        started = parse_ts(rec.get("started_at"))
        if rec.get("id") in (None, skip) or rec.get("kind", "session") != "session" or not started \
                or started < now() - timedelta(days=days):
            continue
        seen, _ = evidence(root, home, rec["id"], started)
        new = (seen & names) - set(rec.get("fired", []))
        if new:
            rec["fired"] = sorted(set(rec.get("fired", [])) | new)
            rec["not_observable"] = sorted(set(rec.get("not_observable", [])) - new)
            save(root, rec)


def save(root, rec, folder="sessions"):
    """Keep the record locally and add it to origin's telemetry branch. Never raises; False if it could not push."""
    local = Path(root) / ".athena" / "sessions"
    local.mkdir(parents=True, exist_ok=True)
    (local / f"{rec['id']}.json").write_text(json.dumps(rec, sort_keys=True))
    idx = Path(root) / ".athena" / "telemetry.index"
    env = {**os.environ, "GIT_INDEX_FILE": str(idx), "GIT_AUTHOR_NAME": "athena", "GIT_AUTHOR_EMAIL": "athena@localhost",
           "GIT_COMMITTER_NAME": "athena", "GIT_COMMITTER_EMAIL": "athena@localhost"}
    try:
        for _ in range(2):  # a second try when another session pushed first
            _git(root, "fetch", "-q", "origin", f"+refs/heads/{TELEMETRY}:{REF}")
            parent = _git(root, "rev-parse", "-q", "--verify", REF).stdout.strip()
            idx.unlink(missing_ok=True)
            if parent:
                _git(root, "read-tree", parent, env=env)
            blob = _git(root, "hash-object", "-w", "--stdin", inp=json.dumps(rec, sort_keys=True)).stdout.strip()
            _git(root, "update-index", "--add", "--cacheinfo", f"100644,{blob},{folder}/{rec['id']}.json", env=env)
            tree = _git(root, "write-tree", env=env).stdout.strip()
            if parent and _git(root, "rev-parse", parent + "^{tree}").stdout.strip() == tree:
                return True
            commit = _git(root, "commit-tree", tree, *(["-p", parent] if parent else []), "-m",
                          f"{folder[:-1]} {rec['id']}", env=env).stdout.strip()
            if commit and _git(root, "push", "-q", "origin", f"{commit}:refs/heads/{TELEMETRY}").returncode == 0:
                return True
        return False
    except Exception:
        return False
    finally:
        idx.unlink(missing_ok=True)


def records(root):
    """Every record this repository knows: this machine's, plus everything on origin's telemetry branch."""
    out = {}
    for f in sorted((Path(root) / ".athena" / "sessions").glob("*.json")):
        r = read_json(f)
        if r.get("id"):
            out[r["id"]] = r
    try:
        _git(root, "fetch", "-q", "origin", f"+refs/heads/{TELEMETRY}:{REF}")
        tar = subprocess.run(["git", "archive", "--format=tar", REF], cwd=root, capture_output=True, timeout=60).stdout
        with tarfile.open(fileobj=io.BytesIO(tar)) as t:
            for m in t.getmembers():
                if m.isfile() and m.name.endswith(".json"):
                    r = json.loads(t.extractfile(m).read() or b"{}")
                    if r.get("id"):
                        out.setdefault(r["id"], r)
    except (OSError, subprocess.SubprocessError, tarfile.TarError, ValueError):
        pass  # no telemetry branch yet, no network, or an unreadable record: this machine's own records still count
    return list(out.values())


def scorecard_json(root, home):
    recs = records(root)
    sessions = [{"id": r["id"], "source": r.get("source"), "started_at": r.get("started_at"), "fired": r.get("fired", []),
                 "not_observable": r.get("not_observable", [])}
                for r in recs if r.get("kind", "session") == "session"]
    comps = []
    for name, r in sorted(collect(root, home).items()):
        last = r["last"]
        for s in sessions:
            t = parse_ts(s["started_at"]) if name in s["fired"] else None
            if t and (last is None or t > last):
                last = t
        comps.append({"name": name, "kind": r["kind"], "idle_limit_days": r["idle_days"],
                      "last_fired": last.isoformat() if last else None,
                      "not_observable_sessions": sum(1 for s in sessions if name in s["not_observable"])})
    return {"components": comps, "sessions": sessions}


def tokens(root, days):
    """Tokens saved per tool over the last `days` days, from the session and measurement records."""
    since = now() - timedelta(days=days)
    saved = {"rtk": 0, "ponytail": None}  # None: no measurement in the window, which is not a saving of 0
    for r in records(root):
        t = parse_ts(r.get("started_at"))
        if not t or t < since:
            continue
        if r.get("kind", "session") == "session":
            saved["rtk"] += int(r.get("rtk_saved") or 0)
        elif r.get("kind") == "measure" and r.get("component") in saved:
            saved[r["component"]] = (saved[r["component"]] or 0) + int(r.get("saved_tokens") or 0)
    return saved


# ---------------------------------------------------------------- models (ATH-23)
F4 = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
PRICE_KEY = dict(zip(F4, ("input", "output", "cache_write", "cache_read")))
SIZE = ("haiku", "sonnet", "opus")  # smallest first


def family(model):
    m = str(model).lower()
    return next((f for f in SIZE if f in m), None)


def models_table(root):
    """models.json: the repository's installed copy, else the template's, else the one next to this script."""
    for p in (Path(root) / ".claude" / "athena" / "models.json", Path(root) / "harness" / "template" / "athena" / "models.json",
              Path(__file__).resolve().parent.parent / "models.json"):
        if p.exists():
            return read_json(p)
    return {}


def usage_by_model(files):
    """Per model: usage summed over these transcripts, each message counted once (the largest output wins)."""
    by_id = {}
    for f in files:
        for line in Path(f).read_text(errors="replace").splitlines():
            try:
                msg = json.loads(line).get("message") or {}
            except (ValueError, AttributeError):
                continue
            u = msg.get("usage") if isinstance(msg, dict) else None
            if not u or not msg.get("id"):
                continue
            nums = {k: int(u.get(k) or 0) for k in F4}
            key = f"{Path(f).name}:{msg['id']}"
            if key not in by_id or nums["output_tokens"] >= by_id[key][1]["output_tokens"]:
                by_id[key] = (msg.get("model") or "unknown", nums)
    out = {}
    for model, nums in by_id.values():
        acc = out.setdefault(model, dict.fromkeys(F4, 0))
        for k in F4:
            acc[k] += nums[k]
    return out


def session_models(transcript):
    """(main-thread usage per model, one entry per subagent and model). A subagent's file `agent-<id>.jsonl` sits in
    `<session>/subagents/` next to `agent-<id>.meta.json`, whose `agentType` names it (confirmed on a real transcript)."""
    main = Path(transcript)
    subs = []
    for f in sorted((main.parent / main.stem / "subagents").glob("*.jsonl")):
        typ = read_json(f.with_suffix(".meta.json")).get("agentType") or "unknown"
        subs += [{"type": typ, "model": m, **u} for m, u in usage_by_model([f]).items()]
    return usage_by_model([main]), subs


def _cost(u, fam, prices):
    return sum(int(u.get(k) or 0) * prices[fam][PRICE_KEY[k]] for k in F4) / 1e6


def model_report(root, days):
    """Lines for `athena tokens`: cost and tokens per model and per kind, unclassified and escalated cost, and the
    share of classified cost that went to a bigger model than models.json asks for."""
    t = models_table(root)
    kinds, prices, names = t.get("kinds", {}), t.get("prices", {}), t.get("names", {})
    if not (kinds and prices):
        return ["models: no models.json found; no cost report"]
    since = now() - timedelta(days=days)
    items, skipped = [], 0  # (name, kind, family, usage, escalated)
    for r in records(root):
        started = parse_ts(r.get("started_at"))
        if r.get("kind", "session") != "session" or not started or started < since:
            continue
        if "models" not in r and "subagents" not in r:
            skipped += 1
            continue
        esc = "diagnosing-bugs" in r.get("fired", [])
        items += [(None, None, family(m), u, esc and family(m) == "opus") for m, u in (r.get("models") or {}).items()]
        items += [(a.get("type"), names.get(a.get("type")), family(a.get("model")), a, False) for a in r.get("subagents") or []]
    ledger = Path(root) / "usage" / "ledger.jsonl"
    for line in ledger.read_text().splitlines() if ledger.exists() else []:
        try:
            row = json.loads(line)
            ts = parse_ts(row["ts"])
        except (ValueError, KeyError):
            continue
        if ts and ts >= since:
            items += [(row.get("source"), names.get(row.get("source")), family(m), u, False)
                      for m, u in (row.get("models") or {}).items()]
    per_model, per_kind, saving = {}, {}, {}
    unclassified = escalated = classified = bigger = 0.0
    for name, kind, fam, u, esc in items:
        if fam not in prices:
            continue
        c, toks = _cost(u, fam, prices), sum(int(u.get(k) or 0) for k in F4)
        for acc, key in ((per_model, fam), (per_kind, kind if kind in kinds and not esc else None)):
            if key:
                a = acc.setdefault(key, [0.0, 0])
                a[0] += c
                a[1] += toks
        want = kinds.get(kind)
        if esc:
            escalated += c
        elif want not in SIZE:
            unclassified += c
        else:
            classified += c
            if SIZE.index(fam) > SIZE.index(want):
                bigger += c
                saving[name] = saving.get(name, 0.0) + c - _cost(u, want, prices)
    out = [f"Cost by model, last {days} days (list prices of {t.get('prices_date', 'unknown date')}; a comparison, not a bill):"]
    out += [f"  {f}: ${c:.2f}, {n:,} tokens" for f, (c, n) in sorted(per_model.items())]
    out += [f"  kind {k} ({kinds[k]}): ${c:.2f}, {n:,} tokens" for k, (c, n) in sorted(per_kind.items())]
    out += [f"  unclassified (main threads and general-purpose subagents): ${unclassified:.2f}",
            f"  escalated (Opus in a session where diagnosing-bugs ran, after two failures in one area): ${escalated:.2f}"]
    if skipped:
        out.append(f"  {skipped} older session record(s) without model data were skipped")
    if not classified:
        out.append(f"No classified work in the last {days} days.")
    elif not saving:
        out.append("0% of the cost of classified work went to a bigger model than the table asks for; there is no saving to name.")
    else:
        top = max(saving, key=saving.get)
        out.append(f"{round(bigger / classified * 100)}% of the cost of classified work went to a bigger model than the "
                   f"table asks for; the biggest saving is {top} (${saving[top]:.2f})")
    return out


# ---------------------------------------------------------------- scorecard
TIER_BUDGET_MIN = {0: 5, 1: 10, 2: 20}  # median CI minutes a tier may take; tier 3 has no budget


def tier_lines(path):
    """One line per tier: the median CI minutes of that tier's newest 20 pull requests, RED when over budget."""
    try:
        records = json.loads(Path(path).read_text())
    except Exception:
        return []
    if not records:
        return []
    lines = ["", "CI time by tier (median minutes of the newest 20 pull requests):"]
    for tier in range(4):
        newest = sorted((r for r in records if r["tier"] == tier), key=lambda r: r["merged_at"])[-20:]
        if not newest:
            continue
        med = statistics.median(r["ci_minutes"] for r in newest)
        budget = TIER_BUDGET_MIN.get(tier)
        flag = f"  RED: budget is {budget} min" if budget is not None and med > budget else \
            ("  (no budget)" if budget is None else "")
        lines.append(f"tier {tier}: median {med:.1f} min over {len(newest)} pull requests{flag}")
    return lines


def scorecard(root, home):
    rows = collect(root, home)
    recs = [r for r in records(root) if r.get("kind", "session") == "session"]
    lines = [f"{'component':34} {'kind':7} {'fired':>5} {'sessions':>8} {'cost (tokens)':>14}  last fired"]
    for name, r in sorted(rows.items(), key=lambda kv: (kv[1]["kind"], kv[0])):
        if r["measured"] or r["kind"] == "task":
            hit = [parse_ts(x.get("started_at")) for x in recs if name in x.get("fired", [])]  # session records' evidence
            r["fired"], r["sessions"] = max(r["fired"], len(hit)), max(r["sessions"], len(hit))
            r["last"] = max([t for t in hit + [r["last"]] if t], default=None)
            last = r["last"].date().isoformat() if r["last"] else "never"
            if not r["last"] and any(name in x.get("not_observable", []) for x in recs):
                last = "not observable (no key or CLI in those sessions)"
            lines.append(f"{name:34} {r['kind']:7} {r['fired']:>5} {r['sessions']:>8} {r['tokens']:>14}  {last}")
        else:
            lines.append(f"{name:34} {r['kind']:7} {'-':>5} {'-':>8} {'-':>14}  not measured here (runs in CI)")
    if os.environ.get("ATHENA_PR_TIMES"):
        lines += tier_lines(os.environ["ATHENA_PR_TIMES"])
    return "\n".join(lines)


# ---------------------------------------------------------------- health
def line_count(p):
    try:
        return len(Path(p).read_text().splitlines())
    except OSError:
        return 0


def usage_dir(home):
    return Path(home) / ".athena" / "usage"


def newest_ledger_ts(home):
    best = None
    for f in usage_dir(home).glob("2*.jsonl"):
        for line in f.read_text(errors="replace").splitlines():
            try:
                t = parse_ts(json.loads(line).get("ts"))
            except ValueError:
                continue
            if t and (best is None or t > best):
                best = t
    return best


def health(root, home, version, env=None):
    """Return a list of (status, text). status is PASS, FAIL or SKIP."""
    env, root, res = env if env is not None else os.environ, Path(root), []
    ci = env.get("ATHENA_HEALTH_CI") == "1"  # set only by the nightly workflow; GitHub cannot see Mac sessions
    add = lambda ok, text: res.append(("PASS" if ok else "FAIL", text))

    handoff = "docs/HANDOFF.md"
    have = read_json(root / ".claude" / "athena" / "MANIFEST.json").get("athena")
    add(have == version, f"harness version {have or 'not installed'} (latest {version})")
    for rel, cap in (("CLAUDE.md", MAX_CLAUDE_MD), ("AGENTS.md", MAX_AGENTS_MD), (handoff, MAX_HANDOFF)):
        n = line_count(root / rel)
        add(n <= cap, f"{rel} has {n} lines (limit {cap})")
    lessons = sum(1 for l in (root / "docs/athena/learnings.md").read_text().splitlines() if l.lstrip().startswith("- ")) \
        if (root / "docs/athena/learnings.md").exists() else 0
    add(lessons <= MAX_LESSONS, f"{lessons} lessons loaded (limit {MAX_LESSONS})")

    stuck = []
    for d in sorted((root / "specs").glob("*/status.json")) if (root / "specs").is_dir() else []:
        s = read_json(d)
        t = parse_ts(s.get("updated_at"))
        if s.get("status") in STUCK_STATES and t and now() - t > timedelta(days=STUCK_DAYS):
            stuck.append(f"{d.parent.name} ({s['status']}, {(now() - t).days} days)")
    add(not stuck, "specs stuck over %d days: %s" % (STUCK_DAYS, ", ".join(stuck) or "none"))

    reviews = review_status(root)
    if reviews or (root / "usage").is_dir():
        bad = [n for n, r in reviews.items() if r.get("status") != "success"]
        add(not bad, "scheduled reviews: " + (("last run failed: " + ", ".join(bad)) if bad else "all last runs succeeded"))
    else:
        res.append(("PASS", "scheduled reviews: none kept in this repository"))

    mode = read_json(root / ".claude" / "settings.json").get("env", {}).get("WINNOW_MODE", "not set")
    res.append(("PASS", f"Jev mode: {mode}"))
    if ci:  # the Jev key, the usage files and the sessions live on the Mac, which GitHub cannot see
        res.append(("SKIP", "Jev key, usage ledger and plan usage are checked on the Mac, not on GitHub"))
    else:
        if read_json(root / ".claude" / "athena" / "config.json").get("typesafe") == "off":
            res.append(("PASS", "Jev key not used: TypeSafe is switched off in this repository"))
        else:
            add(bool(env.get("TYPESAFE_API_KEY")), "Jev key " + ("present" if env.get("TYPESAFE_API_KEY") else
                "missing: TYPESAFE_API_KEY is not set, so the Jev plugins do nothing"))
        canny = Path(home) / ".athena" / "bin" / "canny-hook"
        wired = "canny-hook" in json.dumps(read_json(root / ".claude" / "settings.json").get("hooks") or {})
        if wired:  # only where this repository's hooks call it
            add(os.access(canny, os.X_OK), "Canny " + ("installed" if os.access(canny, os.X_OK) else
                "missing: this repository's hooks call ~/.athena/bin/canny-hook, which is absent, so no done-gate, secret or test-removal guard runs (harness/tools.sh installs it)"))
        led = newest_ledger_ts(home)
        add(bool(led and now() - led < timedelta(days=LEDGER_DAYS)),
            "usage ledger last written " + (led.date().isoformat() if led else "never") + f" (limit {LEDGER_DAYS} days)")
        latest = read_json(usage_dir(home) / "latest.json")
        wk = latest.get("seven_day")
        add(isinstance(wk, (int, float)) and not isinstance(wk, bool),
            "plan usage " + (f"recorded ({wk}% this week)" if isinstance(wk, (int, float)) else
                             "not recorded: " + str(latest.get("seven_day_reason") or "no reading")))
    import shutil
    cc = shutil.which("claude")
    v = subprocess.run([cc, "--version"], capture_output=True, text=True, timeout=20).stdout if cc else ""
    have = tuple(int(x) for x in re.findall(r"\d+", v)[:3])
    if not have:
        res.append(("SKIP", f"Claude Code not found here; Elephant-Goldfish needs {EGM_MIN_CLAUDE} or later"))
    else:
        want = tuple(int(x) for x in EGM_MIN_CLAUDE.split("."))
        add(have >= want, f"Claude Code {'.'.join(map(str, have))} (Elephant-Goldfish needs {EGM_MIN_CLAUDE} or later)")
    card = scorecard_json(root, home)
    if not card["sessions"] and not has_records(home):
        res.append(("SKIP", "idle components: no session records here or on the telemetry branch"))
    else:
        idle = []
        for c in card["components"]:
            last = parse_ts(c["last_fired"]) if c["last_fired"] else None
            if c["kind"] in MEASURED and (last is None or now() - last > timedelta(days=c["idle_limit_days"])):
                idle.append(f"{c['name']} ({'never fired' if last is None else 'last ' + last.date().isoformat()})")
        add(not idle, "components idle past their limit: " + (", ".join(idle) or "none"))
    return res


def render(results):
    return "\n".join(f"{s} {t}" for s, t in results)
