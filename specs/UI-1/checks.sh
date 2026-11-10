#!/usr/bin/env bash
# Acceptance proofs for UI-1. Written BEFORE the product code, by a different agent.
# After `athena lock UI-1` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/bin/checklib.sh"
cd "$ATHENA_ROOT"

# All four go through proofs/harness.py (stdlib Python; see its docstring). Fake data only: the browser part uses the
# local test database (TEST_DATABASE_URL) and the specs' own rows. Where a browser and that database are present (CI's
# web job, a laptop with bin/testdb), one Playwright run of the journey, u51 and screens.spec.ts is made, shared by the
# checks through $UI1_RUN, with proofs/watch.cjs counting the pages visited and the axe runs. Elsewhere each check proves
# the files, imports and Playwright's listing, and says the browser run was skipped and why; CI's `athena journey-run`
# (athena.yml) and web job (ci.yml) run the specs in a real browser.
P=specs/UI-1/proofs
export UI1_RUN="${UI1_RUN:-$(mktemp -d)}"

check "1 @axe-core/playwright is an apps/web dependency and the journey runs axe on every page it visits" \
  python3 $P/harness.py axe
check "2 e2e/athena-journey.ts exists; a journey spec imports it, signs in, opens an existing page and passes; ui-ready UI-1" \
  python3 $P/harness.py journey
check "3 shadcn/ui initialised (components.json); components/ui holds only the stock Button and Tabs" \
  python3 $P/harness.py primitives
check "4 bin/check, test_ux_rules.py, u51 and screens.spec.ts pass; ux.frozen has not grown since main" \
  python3 $P/harness.py unchanged

finish
