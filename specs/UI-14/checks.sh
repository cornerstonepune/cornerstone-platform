#!/usr/bin/env bash
# Acceptance proofs for UI-14. Written BEFORE the product code, by a different agent.
# After `athena lock UI-14` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/bin/checklib.sh"
cd "$ATHENA_ROOT"

# All nine go through proofs/harness.py (stdlib Python; see its docstring). Fake data only. The scope's scripts run in a
# copy of the tree under $UI14_RUN. Where apps/web's node_modules and Chromium exist, the site is built and visited once
# (proofs/browser.mjs), shared by lines 5, 6 and 8 through $UI14_RUN; with TEST_DATABASE_URL it also signs in and visits
# every route screens.spec.ts visits. Elsewhere those checks prove the files and say the browser run was skipped and why.
P=specs/UI-14/proofs
export UI14_RUN="${UI14_RUN:-$(mktemp -d)}"

check "1 tokens.json is docs/frontend/tokens.json byte for byte; tokens.mjs regenerates tokens.css; the suite diffs them" \
  python3 $P/harness.py 1
check "2 no hex colour literal in apps/web/app, components or lib outside tokens.css" \
  python3 $P/harness.py 2
check "3 every usage-note pair meets 4.5:1 or 3:1 in both themes; four near colours >= 20 dE apart; table is the script's" \
  python3 $P/harness.py 3
check "4 tokens.css carries every token of tokens.json: colours both themes, radius, shadow, spacing, press" \
  python3 $P/harness.py 4
check "5 press is the only motion: 0.97 in 160 ms on :active; hover colour-only on a fine pointer; still under reduced motion" \
  python3 $P/harness.py 5
check "6 the four logos copied byte for byte by tokens.mjs; icon.svg is the tile; apple icon a PNG made at build" \
  python3 $P/harness.py 6
check "7 each components/ui file uses var(-- and no hex; shadcn theme on tokens; Button/Tabs baseline committed" \
  python3 $P/harness.py 7
check "8 Source Serif 4 and Source Sans 3 self-hosted; no request off the site; every text's first family is one of them" \
  python3 $P/harness.py 8
check "9 bin/check, test_ux_rules.py, u51 and screens.spec.ts pass; ux.frozen has not grown" \
  python3 $P/harness.py 9

finish
