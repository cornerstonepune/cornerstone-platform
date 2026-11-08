---
name: bash-hook-rewrite-denials
description: Use when a Bash call is refused after a hook rewrites it.
category: tooling
---

# Bash calls that a hook rewrites: send the rewritten command yourself

When a Bash call is refused because a hook changed its input after review, re-sending the identical call is refused again. Send the rewritten command as a new call instead, with the rewrite already in it (for example `rtk git commit ...` where the call was `git commit ...`).

- Retry once, with that rewritten text. If it is refused too, stop retrying.
- Then tell Nimish, in plain words, that auto mode could not check the call because a hook changes it, and that he can turn that hook off or switch out of auto mode.
- Keep going on read-only tools (Read, Grep, Glob); they do not need the classifier.
- The rewrite may only add the tool prefix. If it changes what the command does, do not send it; report instead.
