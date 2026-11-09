---
name: report-claim-check
category: reporting
description: Use when a final report names files, tests or results.
---

# Check every named file and result before reporting

Before a final message names a file, test, command or result, confirm it in the repository or the output on screen, then write it the way the check reports it.

- Name a file by its full repo-relative path, as `git ls-files` prints it. A bare name ("test_fet.py") fails a path check even when the file exists.
- Report a result only if its command ran this session and its output is on screen. Anything else is "not run", with the reason.
- Before reading a red CI check as a code failure, confirm the run's head SHA is the one you pushed; a superseded run can show "cancelled" or "skipped".
