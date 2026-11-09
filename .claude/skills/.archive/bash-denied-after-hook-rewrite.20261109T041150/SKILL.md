---
name: bash-denied-after-hook-rewrite
description: Use when Bash is denied: a hook changed this call's input.
category: harness
---

# A Bash call denied because a hook rewrote it: resubmit the rewritten command, not the original

When the auto-mode classifier refuses a Bash call because a hook changed its input, reissuing the same call is refused again. Instead, issue the command with the hook's rewrite written out by hand (the `rtk ` prefix the hook added, on each part of the command), so the classifier reviews exactly what will run.

- If that is also refused, stop retrying. Read-only tools (Read, Grep, Glob) still work, so keep going with them.
- Then tell Nimish in one line that a hook or plugin changes this call, and that he can turn that hook off or switch out of auto mode to approve the call himself.
