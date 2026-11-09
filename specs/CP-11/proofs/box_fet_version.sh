#!/usr/bin/env bash
# CP-11 item 1, on the box after deploy (check_box), read-only: FET is in the deployed engine image.
#   (a) image: the runtime stage of packages/engine/Dockerfile installs Debian's `fet` and, in the same RUN, runs
#       fet-cl so that the build fails without it. `fet-cl --version | head -1` alone does not: under /bin/sh a pipe's
#       status is head's, so a missing fet-cl would pass. Accepted: `fet-cl --version` not piped, `command -v fet-cl`,
#       `test -x /usr/bin/fet-cl`, or a SHELL with pipefail.
#   (b) CI: a workflow or the proofs' setup (.claude/athena/setup.sh) installs `fet` and prints `fet-cl --version`.
#   (c) box: the running engine container prints FET's version.
# Prints the version line only. Never touches the database.
set -uo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
fail=0

python3 - <<'EOF' || fail=1
import re, sys
text = open("packages/engine/Dockerfile").read()
if "AS runtime" not in text:
    sys.exit("image: the Dockerfile has no runtime stage")
runtime = text.split("AS runtime", 1)[1]
pipefail = re.search(r"^SHELL .*pipefail", runtime, re.M) is not None
runs = [r.replace("\\\n", " ") for r in re.findall(r"^RUN ((?:[^\n]*\\\n)*[^\n]*)", runtime, re.M)]
good = [r for r in runs if re.search(r"apt-get install[^&;]*\bfet\b", r) and (
    pipefail or re.search(r"fet-cl --version(?!\s*\|)", r) or "command -v fet-cl" in r
    or re.search(r"(test|\[) -x /usr/bin/fet-cl", r))]
if not good:
    sys.exit("image: no RUN installs `fet` and fails when fet-cl is missing (a piped `fet-cl --version | head` passes)")
print("image: the runtime stage installs fet and fails without fet-cl")
EOF

if grep -qs 'fet-cl --version' .github/workflows/*.yml .claude/athena/setup.sh \
   && grep -Eqs 'apt-get install[^&;]*\bfet\b' .github/workflows/*.yml .claude/athena/setup.sh; then
  echo "CI: installs fet and prints its version"
else
  echo "CI: no workflow or setup step installs fet and prints fet-cl --version"; fail=1
fi

c="${ENGINE_CONTAINER:-deploy-engine-1}"
v=$(docker exec "$c" fet-cl --version 2>/dev/null || sudo -n docker exec "$c" fet-cl --version 2>/dev/null)
v=$(printf '%s\n' "$v" | head -1)
case "$v" in
  "FET version "*) echo "box: $c prints: $v" ;;
  *) echo "box: the running engine ($c) did not print FET's version"; fail=1 ;;
esac
exit "$fail"
