---
name: cornerstone-child-names-on-screens
category: product-spec
description: Use when a Cornerstone screen shows child names.
---

# Cornerstone shows child names to school staff; no privacy hedging, no roll-number substitute

Show a child's name wherever the educator needs it (class grid, child page, confirm screen, notes, reports). Do not replace names with roll numbers, and do not add privacy caveats or ask whether names may appear. Nimish decided this on 9 Nov 2026: it is the school's own system, and he rejected the hedging as unnecessary.

Two constraints stay, because the repository is public:
- No real child's name in git, tests, fixtures, screenshots or committed baselines. Use obviously fake names.
- Application tables carry `child_id` only. Names are read from `pii` at render time (CLAUDE.md rule 6). Never put a name into a URL, a log, an analytics call or a state word.

Child photos are not decided by this rule: keep the spec's existing photo rule. Any older frontend line saying "no name of a child on any screen" is superseded; change it rather than following it.
