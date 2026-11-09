#!/usr/bin/env bash
# Acceptance proofs for UI-15. Written BEFORE the product code, by a different agent.
# After `athena lock UI-15` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/bin/checklib.sh"
cd "$ATHENA_ROOT"

# The browser proofs (1-3, 5) run the site as its own suite does (apps/web/playwright.config.ts: a production build, the
# engine, the run's own mail server) on TEST_DATABASE_URL, or without it on a fresh copy of the local template database
# ui15_tmpl (`bin/testdb fresh`); proofs/browser.sh says how. Fake @cornerstone.test people only. Staff actions check
# the coordinator group.
P=specs/UI-15/proofs
B="bash $P/browser.sh --config $ATHENA_ROOT/$P/playwright.config.ts"

check "1 add a person, set classes, set subjects refuse an educator and a signed-out request: no row, no email" \
  $B -g "refuses a person not in the coordinator group"
check "2 a coordinator can still do all three; the staff-page specs pass, gate-password changed only to sign in a coordinator" \
  bash $P/staff_page.sh
check "3 the check is the database's access groups: a role-only coordinator refused, a granted educator allowed, no role name in code" \
  bash -c "$B -g 'coordinator-group grant' && python3 $P/static.py no-role-names"
check "4 next in package.json and the lockfile is at least the version docs/notes/UI-15.md records; a lower one fails" \
  bash -c "python3 $P/static.py self-check && python3 $P/static.py next-version"
# 5: the whole browser suite is ci.yml's browser job (longer than athena's 900 s per spec); u51, screens and the journey
# test run here (proofs/suite.sh; `--full` runs everything).
check "5 the upgrade changes no page: u51, screens, the journey test, bin/check pass; ux.frozen not grown" \
  bash $P/suite.sh

finish
