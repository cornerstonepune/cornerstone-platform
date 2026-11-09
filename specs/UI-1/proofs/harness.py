"""UI-1 proofs: the test harness (axe, the journey helper and one journey, shadcn/ui with Button and Tabs, nothing broken).

    python3 specs/UI-1/proofs/harness.py axe|journey|primitives|unchanged      one per Done-when line, 1 to 4

Fake data only: the journey and the existing browser specs run against the local test database (TEST_DATABASE_URL,
which apps/web/playwright.config.ts refuses unless it is on this machine) with their own rows, never the live one.

The browser part runs where it can: TEST_DATABASE_URL set, apps/web's node_modules, the engine's .venv and Playwright's
Chromium all present (CI's web job, or a laptop with bin/testdb). There, one Playwright run of the journey spec(s),
u51-*.spec.ts and screens.spec.ts is made (cached in $UI1_RUN for the four checks) with proofs/watch.cjs loaded, which
records each page the journey visits and each axe run. Elsewhere each check says the browser run was skipped and why,
and proves what can be proven without it (the files, the imports, Playwright's own listing of the specs); the browser
run is then CI's: `athena journey-run` (athena.yml) and the web job (ci.yml).
"""

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
from importlib.machinery import SourceFileLoader
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps" / "web"
HARNESS = WEB / "e2e" / "athena-journey.ts"
ATHENA = ROOT / ".claude" / "athena" / "bin" / "athena"
EXISTING = ["u51-ux-rules.spec.ts", "u51-read-an-uploaded-file-again.spec.ts", "screens.spec.ts"]
RUN = Path(os.environ.get("UI1_RUN") or tempfile.mkdtemp(prefix="ui1-"))
LOCAL_DB = "postgresql://127.0.0.1:5432/postgres"  # only for listing specs: the config asks the address be local


def athena():
    loader = SourceFileLoader("athena_cli", str(ATHENA))
    spec = importlib.util.spec_from_loader("athena_cli", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def sh(cmd, cwd=ROOT, env=None, timeout=600):
    r = subprocess.run(cmd, cwd=str(cwd), env={**os.environ, **(env or {})}, capture_output=True, text=True,
                       timeout=timeout)
    return r.returncode, r.stdout + r.stderr


def base():
    for ref in ("origin/main", "main"):
        rc, out = sh(["git", "merge-base", "HEAD", ref])
        if rc == 0:
            return out.strip()
    fail("no origin/main or main to compare with")


def journeys(a):
    """The journey specs as athena sees them: *.spec.* under apps/web/e2e or tests importing athena-journey."""
    return sorted(a._journey_tests(WEB))


def browser_reason():
    """Why the browser run cannot happen here, or '' when it can."""
    if not os.environ.get("TEST_DATABASE_URL"):
        return "no TEST_DATABASE_URL (the local test database, bin/testdb)"
    if not (WEB / "node_modules" / "@playwright" / "test").exists():
        return "apps/web has no node_modules (npm ci)"
    if not (ROOT / "packages" / "engine" / ".venv" / "bin" / "uvicorn").exists():
        return "the engine is not installed (uv sync in packages/engine)"
    rc, out = sh(["node", "-e", "process.stdout.write(require('@playwright/test').chromium.executablePath())"], WEB)
    if rc != 0 or not Path(out.strip()).exists():
        return "Playwright's Chromium is not installed (npx playwright install chromium)"
    return ""


def listed(files):
    """Playwright's own listing of these spec files under the repo's config (no database, no browser): test count."""
    if not (WEB / "node_modules" / "@playwright" / "test").exists():
        print("note: apps/web has no node_modules here, so Playwright's listing was not checked")
        return None
    env = {"TEST_DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or LOCAL_DB}
    rc, out = sh(["npx", "--no-install", "playwright", "test", "--list", *files], WEB, env, timeout=120)
    m = re.search(r"Total:\s+(\d+)\s+tests?", out)
    if rc != 0 or not m or int(m[1]) == 0:
        fail(f"Playwright does not list {files} under apps/web/playwright.config.ts:\n{out[-1500:]}")
    return int(m[1])


def browser_run(a):
    """One Playwright run of the journey spec(s) and the existing specs, cached in $UI1_RUN. (results, watch log)."""
    result, log = RUN / "result.json", RUN / "watch.log"
    if not result.exists():
        files = [str(f.relative_to(WEB)) for f in journeys(a)] + [f"tests/{n}" for n in EXISTING]
        log.write_text("")
        env = {
            "UI1_WATCH_LOG": str(log),
            "NODE_OPTIONS": f"{os.environ.get('NODE_OPTIONS', '')} --require {Path(__file__).with_name('watch.cjs')}",
            "PLAYWRIGHT_JSON_OUTPUT_FILE": str(result),
            "PLAYWRIGHT_JSON_OUTPUT_NAME": str(result),
        }
        rc, out = sh(["npx", "--no-install", "playwright", "test", *files, "--reporter=line,json"], WEB, env, 1500)
        (RUN / "output.txt").write_text(out)
        if not result.exists():
            fail(f"the Playwright run wrote no results (exit {rc}):\n{out[-2000:]}")
    data = json.loads(result.read_text())
    entries = [json.loads(line) for line in log.read_text().splitlines() if line.strip()]
    return data, entries


def outcomes(data, name):
    """Statuses of every test in the spec file named `name` (expected, unexpected, flaky, skipped)."""
    out = []

    def walk(suite):
        for spec in suite.get("specs", []):
            if Path(spec.get("file", suite.get("file", ""))).name == name:
                out.extend(t.get("status") for t in spec.get("tests", []))
        for s in suite.get("suites", []):
            walk(s)

    for s in data.get("suites", []):
        walk(s)
    return out


def passed(data, name):
    got = outcomes(data, name)
    if not got:
        return f"{name}: no test ran"
    bad = [s for s in got if s not in ("expected", "flaky")]
    return f"{name}: {len(bad)} of {len(got)} tests did not pass ({', '.join(sorted(set(bad)))})" if bad else ""


def page_of(url):
    p = urlsplit(url)
    return p.path + (f"?{p.query}" if p.query else "")


def existing_routes():
    """Route patterns of the pages apps/web had where this branch left main."""
    rc, out = sh(["git", "ls-tree", "-r", "--name-only", base(), "apps/web/app"])
    pats = []
    for f in out.splitlines():
        if not f.endswith("/page.tsx"):
            continue
        parts = [p for p in f.split("/")[3:-1] if not (p.startswith("(") and p.endswith(")"))]
        rx = "/".join(".+" if p.startswith("[...") else "[^/]+" if p.startswith("[") else re.escape(p) for p in parts)
        pats.append(re.compile(f"^/{rx}/?$"))
    return pats


# ---- 1 ---------------------------------------------------------------------------------------------------------------
def check_axe():
    a = athena()
    if "@axe-core/playwright" not in a._deps(WEB):
        fail("@axe-core/playwright is not in apps/web/package.json's dependencies")
    js = journeys(a)
    if not js:
        fail("no journey spec (a *.spec.ts under apps/web/e2e or tests importing athena-journey)")
    if not HARNESS.exists():
        fail(f"{HARNESS.relative_to(ROOT)} does not exist")
    why = browser_reason()
    if why:
        src = HARNESS.read_text()
        if "@axe-core/playwright" not in src or ".analyze(" not in src:
            fail("e2e/athena-journey.ts does not import @axe-core/playwright and run .analyze()")
        print(f"browser run skipped here ({why}); the journey's axe runs are counted where it can run (CI)")
        return
    data, entries = browser_run(a)
    for j in js:
        why = passed(data, j.name)
        if why:
            fail(why)
        mine = [e for e in entries if Path(e["file"]).name == j.name]
        visited = {page_of(e["url"]) for e in mine if e["kind"] == "nav"}
        checked = {page_of(e["url"]) for e in mine if e["kind"] == "axe"}
        if not checked:
            fail(f"{j.name}: axe never ran")
        if visited - checked:
            fail(f"{j.name}: pages visited with no axe run on them: {sorted(visited - checked)}")
        print(f"{j.name}: {len(visited)} pages visited, axe ran on each ({len([e for e in mine if e['kind'] == 'axe'])} runs)")


# ---- 2 ---------------------------------------------------------------------------------------------------------------
def check_journey():
    if not HARNESS.exists():
        fail(f"{HARNESS.relative_to(ROOT)} does not exist")
    a = athena()
    js = journeys(a)
    if not js:
        fail("no journey spec imports athena-journey (a *.spec.ts under apps/web/e2e or tests)")
    rc, out = sh([sys.executable, str(ATHENA), "ui-ready", "UI-1"])
    if rc != 0:
        fail(f"athena ui-ready UI-1 exited {rc}:\n{out}")
    # what ui-ready demands of a slice marked as an interface slice, asked whatever UI-1's status says
    for app in a.web_apps():
        lacking = [lib for lib in a.JOURNEY_LIBS if lib not in a._deps(app)]
        if lacking or not a._journey_tests(app):
            fail(f"{app.relative_to(ROOT)} lacks {lacking or 'a journey test'}: athena ui-ready would refuse a UI slice")
    n = listed([str(j.relative_to(WEB)) for j in js])
    if n:
        print(f"Playwright lists {n} journey test(s) under the repo's config")
    why = browser_reason()
    if why:
        print(f"browser run skipped here ({why}); CI runs the journey in a real browser (athena journey-run, ci.yml)")
        return
    data, entries = browser_run(a)
    routes = existing_routes()
    for j in js:
        why = passed(data, j.name)
        if why:
            fail(why)
        pages = {urlsplit(e["url"]).path for e in entries if e["kind"] == "nav" and Path(e["file"]).name == j.name}
        opened = [p for p in pages if p != "/login" and any(r.match(p) for r in routes)]
        if not opened:
            fail(f"{j.name}: opened no existing page past sign-in (visited {sorted(pages)})")
        print(f"{j.name}: passed in a real browser, signed in and opened {sorted(opened)}")


# ---- 3 ---------------------------------------------------------------------------------------------------------------
PALETTE = ("lime", "basalt", "terracotta", "neem", "bamboo", "mud", "monsoon", "chalk", "ink")
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(|-(?:%s)(?:-\d+)?\b" % "|".join(PALETTE))


def check_primitives():
    cfg = WEB / "components.json"
    if not cfg.exists():
        fail("apps/web/components.json does not exist: shadcn/ui is not initialised")
    c = json.loads(cfg.read_text())
    if "ui.shadcn.com" not in c.get("$schema", ""):
        fail("apps/web/components.json is not shadcn's (no ui.shadcn.com $schema)")
    if not str(c.get("aliases", {}).get("ui", "")).endswith("components/ui"):
        fail(f"components.json's ui alias is {c.get('aliases', {}).get('ui')!r}, not components/ui")
    css = c.get("tailwind", {}).get("css")
    if not css or not (WEB / css).exists():
        fail(f"components.json's tailwind.css {css!r} is not a file in apps/web")
    ui = WEB / "components" / "ui"
    have = sorted(p.name for p in ui.iterdir()) if ui.is_dir() else []
    if have != ["button.tsx", "tabs.tsx"]:
        fail(f"apps/web/components/ui holds {have}, not exactly button.tsx and tabs.tsx")
    button, tabs = (ui / "button.tsx").read_text(), (ui / "tabs.tsx").read_text()
    for name in ("Button", "buttonVariants"):
        if not re.search(rf"\b{name}\b", button) or "export" not in button:
            fail(f"button.tsx does not export {name}")
    for name in ("Tabs", "TabsList", "TabsTrigger", "TabsContent"):
        if not re.search(rf"\b{name}\b", tabs):
            fail(f"tabs.tsx does not export {name}")
    # the stock look: shadcn's own variants and theme classes, no colour of the school's or of anyone's written in
    for v in ("default", "destructive", "outline", "secondary", "ghost", "link"):
        if not re.search(rf"\b{v}\s*:", button):
            fail(f"button.tsx lacks shadcn's stock variant {v!r}")
    if "bg-primary" not in button or "text-primary-foreground" not in button:
        fail("button.tsx's default variant is not shadcn's stock bg-primary text-primary-foreground")
    for name, src in (("button.tsx", button), ("tabs.tsx", tabs)):
        m = COLOUR.search(src)
        if m:
            fail(f"{name} is restyled: it writes the colour {m[0]!r} (UI-14 restyles; this slice leaves the stock look)")
    deps = athena()._deps(WEB)
    for name, src in (("button.tsx", button), ("tabs.tsx", tabs)):
        for mod in re.findall(r"""from\s+["']([^"'.@][^"']*|@[^/"']+/[^"']+)["']""", src):
            pkg = "/".join(mod.split("/")[:2]) if mod.startswith("@") else mod.split("/")[0]
            if pkg not in ("react", "@") and not mod.startswith("@/") and pkg not in deps:
                fail(f"{name} imports {mod}, which is not in apps/web/package.json")
        for mod in re.findall(r"""from\s+["']@/([^"']+)["']""", src):
            if not any((WEB / f"{mod}{ext}").exists() for ext in (".ts", ".tsx", "/index.ts")):
                fail(f"{name} imports @/{mod}, which does not exist in apps/web")
    print("components.json is shadcn's; components/ui holds the stock Button and Tabs only")


# ---- 4 ---------------------------------------------------------------------------------------------------------------
def check_unchanged():
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
    listed([f"tests/{n}" for n in EXISTING])
    why = browser_reason()
    if why:
        print(f"ux.frozen not grown; bin/check and test_ux_rules.py pass; u51 and screens.spec.ts load. "
              f"Browser run skipped here ({why}); CI's web job runs them")
        return
    data, _ = browser_run(athena())
    bad = [w for w in (passed(data, n) for n in EXISTING) if w]
    if bad:
        fail("; ".join(bad))
    print("ux.frozen not grown; bin/check, test_ux_rules.py, u51 and screens.spec.ts pass")


if __name__ == "__main__":
    {"axe": check_axe, "journey": check_journey, "primitives": check_primitives, "unchanged": check_unchanged}[
        sys.argv[1]
    ]()
