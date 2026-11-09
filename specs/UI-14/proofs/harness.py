"""UI-14 proofs: tokens, fonts and the existing parts on them.

    python3 specs/UI-14/proofs/harness.py 1|2|...|9      one per Done-when line

Stdlib only. Fake data only: the browser part signs in as the fake member of staff tests/global-setup.ts uses, on the
local test database (TEST_DATABASE_URL, which must be on this machine), never the live one.

Files are read where they are: docs/frontend/tokens.json (PR #507) and docs/brand/cornerstone-logo/SVG-vector/ (PR #528)
must be in the tree; a check that needs one and finds it missing fails saying so.

The scripts the scope names (apps/web/scripts/tokens.mjs, the contrast script) are run in a copy of the tree under
$UI14_RUN, never in the repository itself, so a proof never writes a file of the product.

The browser part (lines 5, 6, 8) runs where it can: apps/web's node_modules and Playwright's Chromium present. There the
site is built once (`next build` into .next-test, NODE_OPTIONS unset), started with `next start`, and proofs/browser.mjs
visits it; the result is cached in $UI14_RUN for the three checks. With TEST_DATABASE_URL and the engine installed it
also signs in and visits every route screens.spec.ts visits; without them only /login, and the check says so.
Line 9 runs u51 and screens.spec.ts through the repo's own Playwright config when the database is there.
"""

import hashlib
import hmac
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from base64 import urlsafe_b64encode
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
DOCS_TOKENS = ROOT / "docs" / "frontend" / "tokens.json"
LOGO_DIR = ROOT / "docs" / "brand" / "cornerstone-logo" / "SVG-vector"
LOGOS = [f"Cornerstone-logo-{n}.svg" for n in ("lockup-colour", "lockup-for-dark-backgrounds", "mark-on-white-tile", "mark")]
TOKENS_CSS = WEB / "design-system" / "tokens.css"
RUN = Path(os.environ.get("UI14_RUN") or tempfile.mkdtemp(prefix="ui14-"))
EXISTING = ["u51-ux-rules.spec.ts", "u51-read-an-uploaded-file-again.spec.ts", "screens.spec.ts"]
# the paths screens.spec.ts visits (its ROUTES), read from the file so the list cannot drift
SCREENS = WEB / "tests" / "screens.spec.ts"
PRESS = ("0.97", "160ms", "cubic-bezier(0.23,1,0.32,1)")
HEX = re.compile(r"(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])")
WEB_PORT, ENGINE_PORT = 3142, 8942


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def sh(cmd, cwd=ROOT, env=None, timeout=600):
    e = {**os.environ, **(env or {})}
    e.pop("NODE_OPTIONS", None)  # this machine's --use-openssl-ca breaks a local Next build
    r = subprocess.run(cmd, cwd=str(cwd), env=e, capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def base():
    for ref in ("origin/main", "main"):
        rc, out = sh(["git", "merge-base", "HEAD", ref])
        if rc == 0:
            return out.strip()
    fail("no origin/main or main to compare with")


def tokens():
    if not DOCS_TOKENS.exists():
        fail("docs/frontend/tokens.json is not in the tree (PR #507 not merged into this branch)")
    return json.loads(DOCS_TOKENS.read_text())


def need_logos():
    missing = [f for f in LOGOS if not (LOGO_DIR / f).exists()]
    if missing:
        fail(f"docs/brand/cornerstone-logo/SVG-vector/ lacks {missing} (PR #528 not merged into this branch)")


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def mirror(name):
    """A copy of apps/web (no node_modules or builds) and docs/ under $UI14_RUN, for running the scope's scripts."""
    m = RUN / name
    shutil.rmtree(m, ignore_errors=True)
    skip = shutil.ignore_patterns("node_modules", ".next*", "test-results", "playwright-report")
    shutil.copytree(WEB, m / "apps" / "web", ignore=skip, symlinks=True)
    if (WEB / "node_modules").exists():
        (m / "apps" / "web" / "node_modules").symlink_to(WEB / "node_modules")
    shutil.copytree(ROOT / "docs", m / "docs", ignore=shutil.ignore_patterns("screens"))
    return m


def norm(v):
    return re.sub(r"\s+", " ", re.sub(r"\s*([,()])\s*", r"\1", str(v))).strip().lower()


# ---- colours ---------------------------------------------------------------------------------------------------------
def colour_values(t):
    """name -> {light, dark} for every colour token (a plain string is the same in both themes)."""
    out = {}
    for tok in t["color"]["tokens"]:
        v = tok["value"]
        out[tok["name"]] = {"light": v, "dark": v} if isinstance(v, str) else v
    return out


def lum(h):
    h = h.lstrip("#")
    h = "".join(c * 2 for c in h) if len(h) == 3 else h[:6]
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], c


def ratio(a, b):
    x, y = sorted((lum(a)[0], lum(b)[0]), reverse=True)
    return (x + 0.05) / (y + 0.05)


def lab(h):
    _, (r, g, b) = lum(h)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = [v ** (1 / 3) if v > 216 / 24389 else (24389 / 27 * v + 16) / 116 for v in (x, y, z)]
    return 116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])


def delta_e(a, b):
    return sum((p - q) ** 2 for p, q in zip(lab(a), lab(b))) ** 0.5


TEXT, EDGE = 4.5, 3.0


def pairs():
    """Every pair tokens.json's usage notes name: (foreground, background, least ratio)."""
    p = [(fg, bg, TEXT) for fg in ("ink", "ink-muted") for bg in ("ground", "surface", "panel")]
    p += [("link", "ground", TEXT), ("action-ink", "action", TEXT)]
    for s in ("ok", "wait", "late", "quiet"):
        p += [(f"state-{s}", f"state-{s}-bg", TEXT), (f"state-{s}", "ground", TEXT)]
    for k in ("period", "child", "activity", "objective", "skill", "assessment", "note"):
        p += [(f"kind-{k}", f"kind-{k}-bg", EDGE)]  # the icon in its tile
    p += [("subject-numeracy", "subject-numeracy-bg", TEXT), ("subject-language", "subject-language-bg", TEXT),
          ("subject-arts-ink", "subject-arts-bg", TEXT), ("subject-fixed", "subject-fixed-bg", TEXT)]
    p += [("line-control", "ground", EDGE), ("focus", "ground", EDGE), ("state-wait", "ground", EDGE),
          ("subject-arts", "ground", EDGE)]
    return p


NEAR = ("subject-language", "subject-arts", "state-wait", "state-late")


# ---- 1 ---------------------------------------------------------------------------------------------------------------
def check_1():
    t_bytes = DOCS_TOKENS.read_bytes() if DOCS_TOKENS.exists() else tokens()
    copy = WEB / "design-system" / "tokens.json"
    if not copy.exists():
        fail("apps/web/design-system/tokens.json does not exist")
    if copy.read_bytes() != t_bytes:
        fail("apps/web/design-system/tokens.json is not byte-identical to docs/frontend/tokens.json")
    script = WEB / "scripts" / "tokens.mjs"
    if not script.exists():
        fail("apps/web/scripts/tokens.mjs does not exist")
    if not TOKENS_CSS.exists():
        fail("apps/web/design-system/tokens.css does not exist")
    # regenerate from scratch in a copy and diff with the committed tokens.css
    m = mirror("m1")
    (m / "apps/web/design-system/tokens.css").unlink()
    rc, out = sh(["node", "apps/web/scripts/tokens.mjs"], m, timeout=60)
    made = m / "apps/web/design-system/tokens.css"
    if rc != 0 or not made.exists():
        fail(f"`node apps/web/scripts/tokens.mjs` (in a copy of the tree) exited {rc} and wrote no tokens.css:\n{out[-1500:]}")
    if made.read_bytes() != TOKENS_CSS.read_bytes():
        fail("tokens.css regenerated by tokens.mjs differs from the committed tokens.css (they have drifted)")
    # produced *from* tokens.json: a changed value in tokens.json shows up in the output
    m = mirror("m1b")
    old = '"light": "#ffffff", "dark": "#141416"'
    for f in (m / "docs/frontend/tokens.json", m / "apps/web/design-system/tokens.json"):
        f.write_text(f.read_text().replace(old, '"light": "#fefefd", "dark": "#141416"'))
    rc, out = sh(["node", "apps/web/scripts/tokens.mjs"], m, timeout=60)
    if rc != 0 or "#fefefd" not in (m / "apps/web/design-system/tokens.css").read_text().lower():
        fail(f"a colour changed in tokens.json does not reach tokens.css when tokens.mjs runs (exit {rc}):\n{out[-800:]}")
    # the suite regenerates and diffs: some test or fast check runs tokens.mjs
    places = [*(WEB / "tests").rglob("*.ts"), *(WEB / "e2e").rglob("*.ts"), *(ROOT / "packages/engine/tests").rglob("*.py"),
              ROOT / "bin" / "check", ROOT / ".claude/athena/fast-checks.sh", *(ROOT / ".github/workflows").glob("*.yml")]
    if not any(p.is_file() and "tokens.mjs" in p.read_text(errors="ignore") for p in places):
        fail("no test, bin/check, fast check or CI workflow runs scripts/tokens.mjs, so tokens.css could drift")
    print("tokens.json is docs/frontend/tokens.json byte for byte; tokens.mjs regenerates tokens.css exactly; the suite runs it")


# ---- 2 ---------------------------------------------------------------------------------------------------------------
def hex_literals(web=WEB):
    hits = []
    for d in ("app", "components", "lib"):
        for f in sorted((web / d).rglob("*")):
            if f.is_file() and f.suffix in (".ts", ".tsx", ".js", ".mjs", ".css") and f != TOKENS_CSS:
                s = re.sub(r"/\*.*?\*/", "", f.read_text(), flags=re.S)
                s = re.sub(r"(?<![:\w\"'`/])//[^\n]*", "", s)  # line comments ("PR #507"), not "http://"
                hits += [f"{f.relative_to(web)}: {m[0]}" for m in HEX.finditer(s)]
    return hits


def check_2():
    hits = hex_literals()
    if hits:
        fail(f"{len(hits)} hex colour literal(s) remain in apps/web/app, components or lib:\n  " + "\n  ".join(hits[:40]))
    print("no hex colour literal in apps/web/app, components or lib")


# ---- 3 ---------------------------------------------------------------------------------------------------------------
def check_3():
    c = colour_values(tokens())
    bad, rows = [], 0
    for fg, bg, least in pairs():
        for theme in ("light", "dark"):
            if fg not in c or bg not in c:
                bad.append(f"{fg} on {bg}: not in tokens.json")
                continue
            r = ratio(c[fg][theme], c[bg][theme])
            rows += 1
            if r < least:
                bad.append(f"{fg} on {bg} ({theme}) {r:.2f}:1 < {least}:1")
    for i, a in enumerate(NEAR):
        for b in NEAR[i + 1:]:
            d = delta_e(c[a]["light"], c[b]["light"])
            if d < 20:
                bad.append(f"{a} and {b} only {d:.1f} apart (CIE76 ΔE in light) < 20")
    if bad:
        fail("tokens.json falls short:\n  " + "\n  ".join(bad))
    table = ROOT / "docs" / "design-tokens-contrast.md"
    if not table.exists():
        fail("docs/design-tokens-contrast.md does not exist")
    scripts = [f for f in (WEB / "scripts").glob("*.mjs") if "design-tokens-contrast.md" in f.read_text()]
    if not scripts:
        fail("no script in apps/web/scripts writes docs/design-tokens-contrast.md")
    text = table.read_text()
    missing = sorted({n for fg, bg, _ in pairs() for n in (fg, bg) if n not in text} | {n for n in NEAR if n not in text})
    if missing:
        fail(f"docs/design-tokens-contrast.md does not name {missing}")
    m = mirror("m3")
    (m / "docs/design-tokens-contrast.md").unlink()
    rel = scripts[0].relative_to(ROOT)
    rc, out = sh(["node", str(rel)], m, timeout=60)
    made = m / "docs/design-tokens-contrast.md"
    if rc != 0 or not made.exists():
        fail(f"`node {rel}` (in a copy of the tree) exited {rc} and wrote no table:\n{out[-1500:]}")
    if made.read_bytes() != table.read_bytes():
        fail(f"docs/design-tokens-contrast.md differs from what {rel} writes now")
    print(f"{rows} pairs at or above their bar in both themes; the four near colours ≥ 20 apart; the table is {rel}'s output")


# ---- 4 ---------------------------------------------------------------------------------------------------------------
def css_blocks(css):
    """(light, dark) custom properties of tokens.css: top-level rule blocks, and those under prefers-color-scheme: dark
    or with 'dark' in their selector."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    light, dark = {}, {}
    i, stack, head_start = 0, [], 0
    while i < len(css):
        ch = css[i]
        if ch == "{":
            stack.append(css[head_start:i].strip())
            head_start = i + 1
        elif ch == "}":
            heads = stack
            body = css[head_start:i]
            is_dark = any(re.search(r"prefers-color-scheme\s*:\s*dark", h) or (not h.startswith("@") and "dark" in h)
                          for h in heads)
            for k, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", body):
                (dark if is_dark else light).setdefault(k, v.strip())
            stack = stack[:-1]
            head_start = i + 1
        elif ch == ";" and not stack:
            head_start = i + 1
        i += 1
    return light, dark


def resolve(v, *scopes):
    for _ in range(10):
        m = re.fullmatch(r"var\((--[\w-]+)\)", v.strip())
        if not m:
            break
        v = next((s[m[1]] for s in scopes if m[1] in s), v)
    return v


def check_4():
    t = tokens()
    if not TOKENS_CSS.exists():
        fail("apps/web/design-system/tokens.css does not exist")
    light, dark = css_blocks(TOKENS_CSS.read_text())
    bad = []
    for name, v in colour_values(t).items():
        k = f"--{name}"
        if k not in light:
            bad.append(f"{k} missing")
            continue
        if norm(resolve(light[k], light)) != norm(v["light"]):
            bad.append(f"{k} light is {light[k]}, tokens.json says {v['light']}")
        got = dark.get(k, light[k] if v["light"] == v["dark"] else None)
        if got is None or norm(resolve(got, dark, light)) != norm(v["dark"]):
            bad.append(f"{k} dark is {got}, tokens.json says {v['dark']}")
    for group in ("spacing", "radius", "shadow"):
        for tok in t[group]["tokens"]:
            k, v = f"--{tok['name']}", tok["value"]
            v = v if isinstance(v, dict) else {"light": v, "dark": v}
            if k not in light or norm(resolve(light[k], light)) != norm(v["light"]):
                bad.append(f"{k} light is {light.get(k)}, tokens.json says {v['light']}")
            got = dark.get(k, light.get(k) if v["light"] == v["dark"] else None)
            if got is None or norm(resolve(got, dark, light)) != norm(v["dark"]):
                bad.append(f"{k} dark is {got}, tokens.json says {v['dark']}")
    if norm(light.get("--radius-card", "")) != "14px" or norm(light.get("--radius-control", "")) != "10px":
        bad.append("radius-card is not 14px or radius-control is not 10px")
    for tok in t["motion"]["tokens"]:
        props = {k: v for k, v in light.items() if k.startswith(f"--{tok['name']}")}
        joined = norm(" ".join(props.values())).replace(" ", "")
        lacking = [p for p in PRESS if p not in joined]
        if not props or lacking:
            bad.append(f"no --{tok['name']}… custom properties carrying {list(PRESS)} (lacking {lacking})")
    if bad:
        fail(f"tokens.css lacks {len(bad)} token(s) of tokens.json:\n  " + "\n  ".join(bad[:40]))
    print("tokens.css carries every colour (both themes), spacing, radius, shadow and the press motion of tokens.json")


# ---- the browser run (5, 6, 8) ---------------------------------------------------------------------------------------
def browser_reason():
    if not (WEB / "node_modules" / "@playwright" / "test").exists():
        return "apps/web has no node_modules (npm ci)"
    rc, out = sh(["node", "-e", "process.stdout.write(require('@playwright/test').chromium.executablePath())"], WEB)
    if rc != 0 or not Path(out.strip()).exists():
        return "Playwright's Chromium is not installed (npx playwright install chromium)"
    return ""


def db_reason():
    url = os.environ.get("TEST_DATABASE_URL", "")
    if not url:
        return "no TEST_DATABASE_URL (the local test database, bin/testdb)"
    if not re.match(r"^postgres(ql)?://[^@/]*@?(127\.0\.0\.1|localhost)(:\d+)?/\w+$", url):
        return "TEST_DATABASE_URL is not a database on this machine"
    if not (ROOT / "packages/engine/.venv/bin/uvicorn").exists():
        return "the engine is not installed (uv sync in packages/engine)"
    return ""


def screen_routes():
    m = re.search(r"const ROUTES[^=]*=\s*\[(.*?)\];", SCREENS.read_text(), re.S)
    return re.findall(r'\[\s*"(/[^"]*)"', m[1]) if m else []


def wait_for(url, proc, secs):
    end = time.time() + secs
    while time.time() < end:
        if proc.poll() is not None:
            return False
        try:
            urllib.request.urlopen(url, timeout=5)
            return True
        except Exception:
            time.sleep(1)
    return False


def browser_run():
    """Build, start and visit the site once; cached in $UI14_RUN/browser.json. Returns (result, note)."""
    cached = RUN / "browser.json"
    note = RUN / "browser-note.txt"
    if cached.exists():
        return json.loads(cached.read_text()), note.read_text()
    secret = os.urandom(24).hex()
    key = os.urandom(24).hex()
    db = "" if db_reason() else os.environ["TEST_DATABASE_URL"]
    env = {**os.environ, "NEXT_DIST_DIR": ".next-test", "AUTH_SECRET": secret, "AUTH_DEV_BYPASS": "0",
           "ENGINE_URL": f"http://127.0.0.1:{ENGINE_PORT}", "ENGINE_KEY": key, "DATABASE_URL": db}
    env.pop("NODE_OPTIONS", None)
    rc, out = sh(["npx", "--no-install", "next", "build"], WEB, env, timeout=900)
    (RUN / "build.txt").write_text(out)
    if rc != 0:
        fail(f"`next build` failed (exit {rc}):\n{out[-2000:]}")
    procs = []
    try:
        if db:
            procs.append(subprocess.Popen(
                [".venv/bin/uvicorn", "engine.api.app:app", "--port", str(ENGINE_PORT)], cwd=ROOT / "packages/engine",
                env={**env, "DATABASE_URL": db, "ENGINE_KEY": key}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True))
        web = subprocess.Popen(["npx", "--no-install", "next", "start", "--port", str(WEB_PORT)], cwd=WEB, env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        procs.append(web)
        if not wait_for(f"http://localhost:{WEB_PORT}/login", web, 90):
            fail("`next start` did not answer /login within 90 s")
        body = f"{urlsafe_b64encode(b'e2e@cornerstone.test').decode().rstrip('=')}.{int(time.time() * 1000) + 86_400_000}"
        cookie = f"{body}.{hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()}"
        pages = screen_routes() if db else []
        res = RUN / "browser-out.json"
        rc, out = sh(["node", str(Path(__file__).with_name("browser.mjs")), str(res)], WEB, {
            "UI14_BASE": f"http://localhost:{WEB_PORT}", "UI14_COOKIE": cookie, "UI14_PAGES": json.dumps(pages),
            "UI14_WEB": str(WEB), "UI14_DB": db}, timeout=600)
        if rc != 0 or not res.exists():
            fail(f"the browser visit failed (exit {rc}):\n{out[-2000:]}")
    finally:
        for p in procs:
            try:
                os.killpg(p.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    text = "" if db else f"signed-in pages not visited ({db_reason()}); /login only"
    note.write_text(text)
    res.rename(cached)
    return json.loads(cached.read_text()), text


def built_css():
    d = WEB / ".next-test" / "static"
    return {f: f.read_text(errors="ignore") for f in d.rglob("*.css")} if d.exists() else {}


# ---- 5 ---------------------------------------------------------------------------------------------------------------
MOVE = {"transform", "translate", "scale", "rotate", "width", "height", "min-width", "min-height", "max-width",
        "max-height", "top", "left", "right", "bottom", "position", "font-size", "line-height", "letter-spacing"}
MOVE_PREFIX = ("margin", "padding", "inset", "border-width", "border-top-width", "border-right-width",
               "border-bottom-width", "border-left-width", "outline-width", "outline-offset")


def press_ok(t):
    return (norm(t["property"]) == "transform" and norm(t["duration"]) == "0.16s"
            and norm(t["timing"]).replace(" ", "") == "cubic-bezier(0.23,1,0.32,1)")


def check_5():
    why = browser_reason()
    if why:
        src = "".join(p.read_text() for p in [*(WEB / "app").rglob("*.css"), TOKENS_CSS] if p.exists())
        lacking = [p for p in PRESS if p not in norm(src).replace(" ", "")]
        if lacking:
            fail(f"no style sheet of apps/web carries the press motion ({lacking} missing)")
        print(f"browser run skipped here ({why}); the press values are in the style sheets")
        return
    r, note = browser_run()
    bad = []
    pressed = [p for p in r["press"] if p.get("pressed")]
    for kind in ("button", "a"):
        if not any(p["kind"] == kind for p in pressed):
            bad.append(f"no visible {'<button>' if kind == 'button' else 'link-row <a>'} found to press")
    for p in pressed:
        if not p["transform"].startswith("matrix(0.97, 0, 0, 0.97"):
            bad.append(f"{p['kind']} on {p['page']} held down: transform {p['transform']}, not scale(0.97)")
        if not press_ok(p):
            bad.append(f"{p['kind']} on {p['page']}: transition {p['property']} {p['duration']} {p['timing']}")
    for page, info in r["pages"].items():
        for t in info["transitions"]:
            if not press_ok(t):
                bad.append(f"{page} {t['el']}: transition {t['property']} {t['duration']} {t['timing']}, not the press")
                break
        if info["animated"]:
            bad.append(f"{page}: a CSS animation runs ({info['animated'][:3]}); press is the only motion")
    if r["keyframes"]:
        bad.append(f"@keyframes in the served CSS: {sorted({k['name'] for k in r['keyframes']})[:8]}")
    seen = set()
    for h in r["hover"]:
        if h["selector"] in seen:
            continue
        seen.add(h["selector"])
        conds = [norm(c).replace(" ", "") for c in h["conds"]]
        if not any("(hover:hover)" in c and "(pointer:fine)" in c for c in conds):
            bad.append(f"hover rule {h['selector']!r} is not under (hover: hover) and (pointer: fine) (inside {h['conds']})")
        moved = [p for p in h["props"] if p in MOVE or p.startswith(MOVE_PREFIX)]
        if moved:
            bad.append(f"hover rule {h['selector']!r} changes {moved}, not colour only")
    for p in r["reduced"]:
        if p.get("pressed"):
            if p["transform"] != "none":
                bad.append(f"reduced motion: {p['kind']} on {p['page']} still moves when held ({p['transform']})")
            continue
        for t in p["transitions"]:
            if any(d not in ("0s", "") for d in norm(t["duration"]).split(",")) and norm(t["property"]) != "none":
                bad.append(f"reduced motion: {p['page']} {t['el']} keeps a transition {t['property']} {t['duration']}")
                break
        if p["animated"]:
            bad.append(f"reduced motion: {p['page']} runs an animation {p['animated'][:3]}")
    if bad:
        fail(f"{len(bad)} way(s) the motion is not press-only:\n  " + "\n  ".join(bad[:30]))
    print(f"press is the only motion on {sorted(r['pages'])}; hover is colour only on a fine pointer; reduced motion is "
          f"still{'; ' + note if note else ''}")


# ---- 6 ---------------------------------------------------------------------------------------------------------------
def check_6():
    need_logos()
    bad = []
    for f in LOGOS:
        p = WEB / "public" / "brand" / f
        if not p.exists():
            bad.append(f"apps/web/public/brand/{f} missing")
        elif sha(p) != sha(LOGO_DIR / f):
            bad.append(f"apps/web/public/brand/{f} is not the official file byte for byte")
    icon = WEB / "app" / "icon.svg"
    if not icon.exists() or sha(icon) != sha(LOGO_DIR / "Cornerstone-logo-mark-on-white-tile.svg"):
        bad.append("apps/web/app/icon.svg is not Cornerstone-logo-mark-on-white-tile.svg byte for byte")
    apple = [p for p in (WEB / "app").glob("apple-icon.*") if p.suffix in (".tsx", ".ts", ".js", ".jsx")]
    if not apple:
        bad.append("no apps/web/app/apple-icon.(tsx|ts|js): the app icon is not made at build time")
    elif "mark-on-white-tile" not in apple[0].read_text():
        bad.append(f"{apple[0].name} does not make the icon from mark-on-white-tile")
    rc, out = sh(["git", "ls-files", "apps/web/app", "apps/web/public"])
    pngs = [f for f in out.splitlines() if f.lower().endswith(".png")]
    if pngs:
        bad.append(f"PNG files committed: {pngs}")
    rc, _ = sh(["git", "check-ignore", "-q", "apps/web/app/apple-icon.png"])
    if rc != 0:
        bad.append("a PNG in apps/web/app is not ignored by git")
    if bad:
        fail("\n  ".join(bad))
    # the tokens script is what copies them: in a copy of the tree with the four removed, it puts them back
    m = mirror("m6")
    for f in LOGOS:
        (m / "apps/web/public/brand" / f).unlink(missing_ok=True)
    rc, out = sh(["node", "apps/web/scripts/tokens.mjs"], m, timeout=60)
    for f in LOGOS:
        p = m / "apps/web/public/brand" / f
        if not p.exists() or sha(p) != sha(LOGO_DIR / f):
            fail(f"tokens.mjs (exit {rc}) does not copy {f} into public/brand/ byte for byte:\n{out[-800:]}")
    why = browser_reason()
    if why:
        print(f"logos copied byte for byte by tokens.mjs; icon.svg is the tile; apple-icon present. Browser run skipped "
              f"here ({why}), so the built PNG was not fetched")
        return
    r, _ = browser_run()
    a = r.get("appleIcon") or {}
    if not a.get("href"):
        fail("the built /login has no <link rel=\"apple-touch-icon\">")
    if a.get("status") != 200 or "image/png" not in a.get("type", "") or a.get("head") != "89504e470d0a1a0a":
        fail(f"the built apple icon {a.get('href')} is not a PNG: status {a.get('status')}, type {a.get('type')!r}")
    print(f"logos copied byte for byte by tokens.mjs; icon.svg is the tile; the build serves {a['href']} as a PNG")


# ---- 7 ---------------------------------------------------------------------------------------------------------------
SHADCN = ("background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary",
          "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent",
          "accent-foreground", "destructive", "border", "input", "ring")


def check_7():
    ui = WEB / "components" / "ui"
    files = sorted(ui.glob("*.tsx")) if ui.is_dir() else []
    have = {f.name for f in files}
    if not {"button.tsx", "tabs.tsx"} <= have:
        fail(f"apps/web/components/ui holds {sorted(have)}: the shadcn Button and Tabs from UI-1 are not there")
    bad = []
    for f in files:
        s = f.read_text()
        if "var(--" not in s:
            bad.append(f"{f.name} references no var(--…)")
        hexes = HEX.findall(s)
        if hexes:
            bad.append(f"{f.name} writes hex colours {hexes[:4]}")
    names = {f"--{t['name']}" for t in tokens()["color"]["tokens"]}
    cfg = WEB / "components.json"
    css = WEB / json.loads(cfg.read_text()).get("tailwind", {}).get("css", "app/globals.css") if cfg.exists() else WEB / "app/globals.css"
    text = re.sub(r"/\*.*?\*/", "", css.read_text(), flags=re.S) if css.exists() else ""
    for k, v in re.findall(r"(--(?:color-)?(?:%s))\s*:\s*([^;]+);" % "|".join(SHADCN), text):
        refs = re.findall(r"var\((--[\w-]+)", v)
        # a token of tokens.json, or another of shadcn's names (itself held to this rule)
        if not refs or not all(r in names or r.removeprefix("--color-").removeprefix("--") in SHADCN for r in refs):
            bad.append(f"{css.name}: shadcn's {k} is {v.strip()!r}, not a token of tokens.json")
    rc, out = sh(["git", "diff", "--name-only", f"{base()}...HEAD", "--", "apps/web"])
    rc2, out2 = sh(["git", "ls-files", "apps/web"])
    tracked = set(out2.splitlines())
    snaps = [f for f in out.splitlines() if f in tracked and f.endswith(".png") and "-snapshots/" in f
             and re.search(r"button|tab", Path(f).name, re.I)]
    if not snaps:
        bad.append("no screenshot baseline of the Button or Tabs (a *-snapshots/*button*|*tab*.png) committed in this slice")
    if bad:
        fail("\n  ".join(bad))
    print(f"{sorted(have)} draw from var(--…) tokens with no hex; shadcn's theme maps to tokens; baselines {snaps}")


# ---- 8 ---------------------------------------------------------------------------------------------------------------
FAMILIES = {"Source Serif 4", "Source Sans 3"}


def check_8():
    why = browser_reason()
    if why:
        layout = (WEB / "app" / "layout.tsx").read_text()
        for f in ("Source_Serif_4", "Source_Sans_3"):
            if f not in layout:
                fail(f"app/layout.tsx does not load {f} with next/font")
        print(f"browser run skipped here ({why}); layout.tsx loads both families with next/font")
        return
    r, note = browser_run()
    bad = []
    css = "\n".join(built_css().values())
    faces = re.findall(r"@font-face\s*{([^}]*)}", css)
    for fam in FAMILIES:
        own = [f for f in faces if re.search(rf"font-family:\s*['\"]?{fam}['\"]?\s*[;}}]", f + ";")]
        if not own:
            bad.append(f"the build's CSS has no @font-face for {fam!r}")
        # the CSS sits in /_next/static/chunks/, so next/font writes ../media/ for /_next/static/media/
        elif not all(re.search(r"url\(['\"]?(/_next/static/|\.\./)media/", f) for f in own):
            bad.append(f"an @font-face for {fam!r} is not served from /_next/static/media/")
    origin = f"http://localhost:{WEB_PORT}"
    foreign = sorted({q["url"].split("/")[2] for q in r["requests"]
                      if q["url"].startswith("http") and not q["url"].startswith(origin + "/")})
    if foreign:
        bad.append(f"requests to hosts other than the site's own: {foreign}")
    for page, info in r["pages"].items():
        if info["signedIn"] and info["landed"] == "/login":
            bad.append(f"{page} sent the signed-in visit to /login")
        others = {f: els for f, els in info["fonts"].items() if f not in FAMILIES}
        if others:
            bad.append(f"{page}: text in {others}")
    if bad:
        fail("\n  ".join(bad[:30]))
    print(f"both families self-hosted; {len(r['requests'])} requests, all to the site; every text's first family on "
          f"{sorted(r['pages'])} is Source Serif 4 or Source Sans 3{'; ' + note if note else ''}")


# ---- 9 ---------------------------------------------------------------------------------------------------------------
def check_9():
    head = json.loads((ROOT / "workflows.json").read_text())["ux"]["frozen"]
    rc, out = sh(["git", "show", f"{base()}:workflows.json"])
    if rc != 0:
        fail(f"cannot read workflows.json on main: {out}")
    was = json.loads(out)["ux"]["frozen"]
    grown = [f"{k}: {sorted(set(v) - set(was.get(k, [])))}" for k, v in head.items() if set(v) - set(was.get(k, []))]
    if grown:
        fail("ux.frozen has grown since main: " + "; ".join(grown))
    rc, out = sh([str(ROOT / "bin" / "check")], timeout=900)
    if rc != 0:
        fail(f"bin/check failed:\n{out[-2000:]}")
    py = ROOT / "packages" / "engine" / ".venv" / "bin" / "python"
    rc, out = sh([str(py), "-m", "pytest", "tests/test_ux_rules.py", "-q", "-p", "no:cacheprovider", "-o", "addopts="],
                 ROOT / "packages" / "engine", timeout=300)
    if rc != 0:
        fail(f"test_ux_rules.py failed:\n{out[-2000:]}")
    why = browser_reason() or db_reason()
    if why:
        print(f"ux.frozen not grown; bin/check and test_ux_rules.py pass. Browser run of u51 and screens.spec.ts skipped "
              f"here ({why}); CI's web job runs them")
        return
    result = RUN / "pw.json"
    rc, out = sh(["npx", "--no-install", "playwright", "test", *[f"tests/{n}" for n in EXISTING], "--reporter=line,json"],
                 WEB, {"PLAYWRIGHT_JSON_OUTPUT_FILE": str(result), "PLAYWRIGHT_JSON_OUTPUT_NAME": str(result)}, 1500)
    (RUN / "pw.txt").write_text(out)
    if rc != 0:
        fail(f"u51 / screens.spec.ts did not pass (exit {rc}):\n{out[-2500:]}")
    print("ux.frozen not grown; bin/check, test_ux_rules.py, u51 and screens.spec.ts pass")


if __name__ == "__main__":
    {"1": check_1, "2": check_2, "3": check_3, "4": check_4, "5": check_5, "6": check_6, "7": check_7, "8": check_8,
     "9": check_9}[sys.argv[1]]()
