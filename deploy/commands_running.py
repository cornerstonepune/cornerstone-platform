"""Which engine commands are running in this container, for deploy-engine.yml to wait for.

Replacing the engine (deploy/switch.sh) kills what `curriculum run` started in it with `docker exec`: the deploy of #807 ended a paid
`skill_goods` run part-way (exit 137, 16 Nov 2026). The workflow pipes this file into the serving engine, `python - WORD…`, where WORD
are the engine's own subcommands to watch (`.github/curriculum/command.py --watch`), so it reads nothing of the engine's code: the
container may be running the code from before this file existed. It counts the processes whose command line is `engine WORD …` (the
console script, with or without the interpreter before it) and prints the count, then the commands by their first two words, never the
rest of a line: a line can carry a person's email, and the log is public.
"""

import os
import sys


def running(words, proc="/proc", own=None):
    """The `engine WORD` pairs running under `proc` (a folder of numbered folders, as /proc), not counting `own`, this process."""
    own = os.getpid() if own is None else own
    found = []
    for entry in os.listdir(proc):
        if not entry.isdigit() or int(entry) == own:
            continue
        try:
            with open(f"{proc}/{entry}/cmdline", "rb") as f:
                argv = [a.decode(errors="replace") for a in f.read().split(b"\0") if a]
        except OSError:  # it ended while we looked
            continue
        for i, word in enumerate(argv[:3]):  # `engine …`, or `python /usr/local/bin/engine …`
            if os.path.basename(word) == "engine" and i + 1 < len(argv) and argv[i + 1] in words:
                found.append(f"engine {argv[i + 1]}")
                break
    return found


if __name__ == "__main__":
    found = running(set(sys.argv[1:]))
    print(len(found), *sorted(set(found)))
