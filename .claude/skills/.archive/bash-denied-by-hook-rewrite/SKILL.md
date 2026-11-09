---
name: bash-denied-by-hook-rewrite
category: tooling
description: Use when Bash denied: automode-unavailable or hook-changed.
---

# A Bash call denied because a hook rewrote it

A denial that quotes a rewritten command is not a verdict on the command. Re-issue exactly the quoted input once. If it is denied again, stop retrying that command.

- For anything read-only (a file, a directory listing, a search), use Read, Grep or Glob instead. They do not go through the classifier.
- Before any multi-step git state change (stash, switch, `rm --cached`, stash drop) while a Bash call is blocked, run `git status` and confirm what is actually on disk. A call that half-ran, such as a stash pushed before a switch, leaves the tree in a state the next retry does not expect.
- Never drop a stash to clear a pop conflict until the stashed content is confirmed in the working tree.
- If the retry is also denied, tell the user plainly: auto mode could not check this command because a hook or plugin changes it, and they can turn that hook off, ask their administrator, or switch out of auto mode to approve it.
