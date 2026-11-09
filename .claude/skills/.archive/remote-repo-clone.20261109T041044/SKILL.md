---
name: remote-repo-clone
description: Use when cloning a second repo or a push gets HTTP 413.
category: git-workflow
---

# Clone a second repository safely in a remote session

Clone one repository at a time: shallow, with a long command timeout, and never two at once through the session's git proxy.

- Run `git clone --depth 1 URL DIR` with a command timeout of about 10 minutes. The default two-minute timeout can kill index-pack mid-unpack and leave a broken half-clone.
- While index-pack looks stalled, wait. Do not interrupt, kill or re-run it.
- If DIR already exists, first run `git -C DIR rev-parse HEAD`. If that works, use the clone. If it fails, watch the size of DIR/.git for about 60 seconds: growth means a clone is live, so wait. Delete DIR only when it holds nothing but `.git` and that size has not changed. Anything else in it is not yours to remove; stop and report the path.
- HTTP 429 "too many concurrent transfers" is the local concurrency cap, not a GitHub rate limit. Sleep 5 seconds and retry once. Do not loop or spawn workers to race it.
- Before pushing from a shallow clone, run `git -C DIR fetch origin DEFAULT_BRANCH` and rebase if needed, so the push sends a thin pack. Otherwise the push can fail with HTTP 413.
- For more history, use a bounded `git -C DIR fetch --depth=N origin BRANCH`. Do not use `--unshallow`; some git policy hooks block it.
