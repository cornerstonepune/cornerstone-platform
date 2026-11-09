# Gate details

- Engine not installed ("engine is not installed yet: uv sync"): in a fresh cloud container run `cd /home/user/cornerstone-platform/packages/engine && uv sync` once, then the checks. Record it in the handoff as an environment step, not a code change.
- Plugin writes under `.claude/autoharness/`, and `*.ledger.jsonl` and `*.sidecar.json` files, show as changed to the gate. Leave them out of commits and say so in one line.
- The RTK hook rewrites Bash input. If the classifier denies a call because a hook changed its input, reissue that exact input once; if it is denied again, report it to Nimish and stop retrying.
