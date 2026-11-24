#!/usr/bin/env python3
"""CI backstop for the loop. Runs on every PR; local hooks can be bypassed, this can't.

1. Every PR updates HANDOFF.md.
2. A PR that changes PROJECT.md or the schema adds a new ADR in docs/adr/.
3. Only `plan/` branches may touch protected files or modify/delete existing tests.
4. Frontend code only for screens Nimish approved: PR body has `Screens: <id>, <id>` and each
   id is in design/approved.json with a hash matching the current wireframe.
5. Design system: no raw colours / arbitrary Tailwind values in frontend code (use tokens);
   design/brand.css may only override the variables listed in brand_overridable.
Usage: check_pr.py <base-ref> <head-branch>   (PR body in env PR_BODY)
"""
import fnmatch
import hashlib
import json
import os
import re
import subprocess
import sys

DEFAULT_PROTECTED = ["PROJECT.md", "CLAUDE.md", ".loop.json", "db/schema.sql", "prisma/schema.prisma",
                     "**/schema.prisma", "docs/adr/**", ".github/workflows/**", ".github/loop/**", "design/**"]
DEFAULT_TESTS = ["tests/**", "test/**", "**/__tests__/**", "**/test_*.py", "**/*_test.py",
                 "**/*.test.*", "**/*.spec.*", "**/*_test.go"]
DEFAULT_FRONTEND = ["app/**/*.tsx", "src/app/**", "src/components/**", "src/pages/**", "apps/web/**",
                    "components/**", "**/*.tsx", "**/*.jsx", "**/*.vue", "**/*.svelte", "**/*.css"]
DEFAULT_BRAND = ["--accent", "--accent-2", "--accent-soft", "--accent-rule", "--wash-1", "--wash-2", "--wash-3", "--font-serif", "--font-sans"]
LOCKED = ["PROJECT.md", "db/schema.sql", "prisma/schema.prisma", "**/schema.prisma"]
RAW_STYLE = re.compile(r"""(?:[:"'\s(=]#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b|\brgba?\(|\bhsla?\(|-\[#|-\[\d+(?:px|rem)\])""")


def matches(path, patterns):
    return any(fnmatch.fnmatch(path, p) or (p.startswith("**/") and fnmatch.fnmatch(path, p[3:])) for p in patterns)


def sh(*args):
    return subprocess.run(list(args), capture_output=True, text=True, check=True).stdout


def wf_hash(sid):
    try:
        return hashlib.sha256(open(f"design/wireframes/{sid}.html", "rb").read()).hexdigest()[:16]
    except OSError:
        return ""


def main():
    base, head = sys.argv[1], sys.argv[2]
    cfg = json.load(open(".loop.json")) if os.path.exists(".loop.json") else {}
    protected = cfg.get("protected", DEFAULT_PROTECTED) + [".github/loop/**"]
    tests = cfg.get("tests", DEFAULT_TESTS)
    frontend = cfg.get("frontend", DEFAULT_FRONTEND)
    token_files = cfg.get("token_files", ["design/**", "**/tokens.css", "**/brand.css"])
    brand_ok = set(cfg.get("brand_overridable", DEFAULT_BRAND))

    changes = []
    for line in sh("git", "diff", "--name-status", f"{base}...HEAD").splitlines():
        parts = line.split("\t")
        status, path = parts[0][0], parts[-1]
        changes.append((status, path))
        if status == "R":
            changes.append(("D", parts[1]))
    paths = {p for _, p in changes}
    errors = []

    # Builder rules apply only to commits after Plan's seed (`Plan-base: <sha>` written by `loop run-ticket`).
    body = os.environ.get("PR_BODY", "")
    pb = re.search(r"^Plan-base:\s*([0-9a-f]{7,40})\s*$", body, re.M)
    bbase = base
    if pb and subprocess.run(["git", "merge-base", "--is-ancestor", pb.group(1), "HEAD"]).returncode == 0:
        bbase = pb.group(1)
    # The builder's own commits: non-merge, after Plan-base, not on the base branch. A diff from Plan-base would also
    # count whatever a merge of main (`loop prep`, `gh pr update-branch`) brought in.
    bcommits = [f"{bbase}..HEAD", f"^{base}"]
    bchanges = changes if bbase == base else []
    if bbase != base:
        first, deleted = {}, set()
        log = sh("git", "log", "--no-merges", "--reverse", "--format=", "--name-status", *bcommits)
        for line in filter(None, log.splitlines()):
            parts = line.split("\t")
            for s, p in ([("D", parts[1])] if parts[0][0] == "R" else []) + [(parts[0][0], parts[-1])]:
                first.setdefault(p, s)
                if s == "D":
                    deleted.add(p)
        # a file the builder added keeps "A"; an existing one is "D" if the builder deleted it, else its first status
        bchanges = [("D" if p in deleted and s != "A" else s, p) for p, s in first.items()]

    # 1–3  (ticket PRs leave docs/loop/handoff/<N>.md; other PRs update HANDOFF.md)
    ticket_handoff = any(p.startswith("docs/loop/handoff/") for p in paths)
    if bbase != base:
        if not ticket_handoff:
            errors.append("Ticket PR without a handoff: write docs/loop/handoff/<ticket>.md.")
        if "HANDOFF.md" in {p for _, p in bchanges}:
            errors.append("Ticket PRs must not edit HANDOFF.md (parallel tickets conflict). Use docs/loop/handoff/<ticket>.md.")
    elif "HANDOFF.md" not in paths and not ticket_handoff:
        errors.append("HANDOFF.md was not updated. Every PR must leave a fresh handoff.")
    if any(matches(p, LOCKED) for p in paths) and not any(s == "A" and p.startswith("docs/adr/") for s, p in changes):
        errors.append("PROJECT.md or the schema changed without a new ADR in docs/adr/.")
    if not head.startswith("plan/"):
        for s, p in bchanges:
            if matches(p, protected):
                errors.append(f"{p}: protected file changed on a build branch. Only plan/ branches may change it.")
            elif matches(p, tests) and s in ("M", "D"):
                errors.append(f"{p}: existing test {'modified' if s == 'M' else 'deleted'} on a build branch.")

    # 3b. ticket size budget (written into the PR body by `loop run-ticket` from the ticket)
    b = re.search(r"^Budget:\s*files\s*<=\s*(\d+)\s+lines\s*<=\s*(\d+)", body, re.M | re.I)
    if b and not head.startswith("plan/"):
        max_files, max_lines = int(b.group(1)), int(b.group(2))
        skip = lambda p: p == "HANDOFF.md" or p.startswith("docs/loop/") or matches(p, tests) or p.endswith((".lock", "lock.json", "lock.yaml"))
        files = [p for s_, p in bchanges if not skip(p)]
        lines = 0
        # shortcut: sums each builder commit's lines, so a line rewritten in two commits counts twice; fine while
        # `loop finish` makes one builder commit per attempt, upgrade if budgets fail on multi-commit builds
        numstat = (sh("git", "diff", "--numstat", f"{base}...HEAD") if bbase == base
                   else sh("git", "log", "--no-merges", "--format=", "--numstat", *bcommits))
        for row in numstat.splitlines():
            a, d, p = (row.split("\t") + ["", "", ""])[:3]
            if a.isdigit() and d.isdigit() and not skip(p):
                lines += int(a) + int(d)
        slack = 1.2
        if len(files) > max_files * slack or lines > max_lines * slack:
            errors.append(f"Over the ticket's size budget: {len(files)} files / {lines} lines vs "
                          f"budget {max_files} / {max_lines}. The ticket is too big or the build sprawled — split it.")

    # 4. wireframe gate
    fe = sorted(p for s, p in changes if s != "D" and matches(p, frontend) and not p.startswith("design/"))
    if fe:
        m = re.search(r"^Screens:\s*(.+)$", os.environ.get("PR_BODY", ""), re.M | re.I)
        listed = [x.strip() for x in m.group(1).split(",") if x.strip()] if m else []
        approved = json.load(open("design/approved.json")).get("screens", {}) if os.path.exists("design/approved.json") else {}
        if not listed:
            errors.append(f"Frontend files changed ({len(fe)}) but the PR body has no `Screens: <id>, …` line.")
        for sid in listed:
            a = approved.get(sid)
            if not a:
                errors.append(f"Screen {sid} has no approval from Nimish (design/approved.json).")
            elif a.get("hash") != wf_hash(sid):
                errors.append(f"Screen {sid}: wireframe changed after approval. Needs re-approval.")

    # 5. design-system discipline
    for p in fe:
        if matches(p, token_files):
            continue
        added = [l[1:] for l in sh("git", "diff", "-U0", f"{base}...HEAD", "--", p).splitlines()
                 if l.startswith("+") and not l.startswith("+++")]
        bad = [l.strip() for l in added if RAW_STYLE.search(l) and "loop-allow-color" not in l]
        if bad:
            errors.append(f"{p}: raw colour/size instead of design tokens, e.g. `{bad[0][:80]}`. "
                          "Use a token (var(--…) or the Tailwind preset).")
    if os.path.exists("design/brand.css") and "design/brand.css" in paths:
        declared = set(re.findall(r"(--[\w-]+)\s*:", open("design/brand.css").read()))
        extra = declared - brand_ok
        if extra:
            errors.append(f"design/brand.css overrides non-brand tokens: {', '.join(sorted(extra))}. "
                          f"Projects may only change: {', '.join(sorted(brand_ok))}.")

    if errors:
        print("loop-guard FAILED:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"loop-guard passed ({len(paths)} files, branch {head}).")


if __name__ == "__main__":
    main()
