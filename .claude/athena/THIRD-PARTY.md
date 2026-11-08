# Third-party material in the Athena harness

Vendored on 10 Oct 2026 with Nimish's written approval. Each file was screened before vendoring for instruction overrides. Two make network calls unless switched off, and the harness switches both off in every repository's settings (ATH-21): archify's update check (`ARCHIFY_UPDATE_CHECK_DISABLED=1`) and Strix's telemetry in the pentest skill (`STRIX_TELEMETRY=0`). Licences are in `licenses/`.

| What | Where it lives here | Source (commit) | Licence |
| --- | --- | --- | --- |
| documentation-and-adrs, security-and-hardening skills | `.claude/skills/<name>/` | addyosmani/agent-skills (`1be8e34187e34647bb83adc3a1323b26ae6f6abe`) | MIT |
| security-and-hardening's checklist (`references/security-checklist.md`) | `.claude/references/` | addyosmani/agent-skills (`1be8e34187e34647bb83adc3a1323b26ae6f6abe`), vendored 7 Nov 2026 (ATH-21) | MIT |
| thinking-out-loud, scope-creep-detector skills | `.claude/skills/<name>/` | Shubhamsaboo/awesome-llm-apps, `agent_skills/` (`4bf51ab704fb2c5b3803cd5191b30d7dcdb51dc2`) | Apache-2.0 |
| reality-checker reviewer persona | `.claude/agents/<name>.md` | msitarzewski/agency-agents (`f99f6aa910a442b0197b768ce0ea7751e35e2060`) | MIT |
| Superpowers skills: writing-plans, subagent-driven-development, using-git-worktrees | `.claude/skills/<name>/` | obra/superpowers v7 (see `SUPERPOWERS-NOTICE.md`) | MIT |
| gstack skills: office-hours, plan-ceo-review, plan-eng-review, design-consultation, design-shotgun, design-review, review, qa, cso, canary, learn (each folder keeps gstack's LICENSE; build templates dropped; plan-ceo-review's frontmatter hook and bin/ removed). gstack's runtime is not vendored | `.claude/skills/<name>/` | garrytan/gstack (`297f50c7e1d46aab1404f5f2e8a9584af76ad6b2`) | MIT |
| Matt Pocock's skills: grill-with-docs, grilling, codebase-design, domain-modeling, to-spec, to-tickets, tdd, diagnosing-bugs, retro, writing-for-agents | `.claude/skills/<name>/` | mattpocock/skills (`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`) | MIT |
| frontend-design skill | `.claude/skills/frontend-design/` | anthropics/skills (`2c5958ecac7cee2b583967a2c4981d0f4a75c579`) | Apache-2.0 |
| find-skills skill (its CLI, `skills@1.7.6`, runs through npx with telemetry off) | `.claude/skills/find-skills/` | vercel-labs/skills (`d3701c11b1101251af14c9d148f026e1a47ebe17`) | MIT |
| archify skill, without its 13MB of rendered example pages (the example inputs it needs to run are kept) | `.claude/skills/archify/` | tt-a1i/archify, `archify/` (`b25142deac4b19b293e45b6bf6d69351d3c8f3b6`) | MIT |
| pentest skill: Athena's own instructions for running Strix; no Strix code is vendored | `.claude/skills/pentest/` | usestrix/strix (installed per machine with `pipx install strix-agent`) | Apache-2.0 |
| "Four rules for every change" in `CLAUDE.md`: paraphrased from the Karpathy-inspired guidelines, no text vendored | `.claude/athena/CLAUDE.md` | multica-ai/andrej-karpathy-skills, `CLAUDE.md` (`2c606141936f1eeef17fa3043a72095b4765b9c2`) | MIT |
| autoharness plugin | `.claude/plugins/autoharness/` | tigerless-labs/autoharness (`9eec6232587ff2c4deeded00ac467de19532d763`) | MIT |
| toolgate plugin (its CLI is installed per machine, `@riskaverse/toolgate@0.16.0`) | `.claude/plugins/toolgate/` | RiskAverseTech/toolgate, `plugin/` (`31e8a2a72e4d05594be78d4588b170744020253d`) | MIT |
| winnow plugin | `.claude/plugins/winnow/` | GhalebDweikat/winnow (`4547a81b88ac59a902bad7b0006137c7d4147aeb`) | MIT |
| fast-jev-compaction plugin | `.claude/plugins/fast-jev-compaction/` | tamaratran/fast-jev-compaction (`e3f262a7f4d42bd8dd32ced30d26176f7cb545b0`) | MIT |
| jev plugin (jevwire) | `.claude/plugins/jev/` | Brainwires/jevwire, `plugin/` (`757468d6743f55225b9635e1d5f24524da79c2bc`) | MIT |
| ponytail plugin | `.claude/plugins/ponytail/` | DietrichGebert/ponytail (`9b58c1ffb790c075ca32e70a89cf1d80588f4abf`) | MIT |
| egm plugin (Elephant-Goldfish Model; markdown only, no hooks, no telemetry) | `.claude/plugins/egm/` | google/elephant-goldfish-model, v0.1.1 (`dea7761de06ce5b51c177ebb9bba0469f24af5a4`), only its runtime set (ATH-15) | Apache-2.0 |

Each skill vendored for ATH-10 (7 Nov 2026) was read end to end first; its source, pinned commit, review notes and any swap are in `skills.lock.json`, and every copy carries one added `model:` frontmatter line (the model protocol). The seven plugins above were vendored on 7 Nov 2026 (ATH-16) by `athena-ops/harness/vendor_plugins.py`, at the commits pinned in `athena-ops/.claude-plugin/marketplace.json` and recorded in `.claude/plugins/plugins.lock.json`. Each folder is the plugin's own, unchanged, without its tests, docs, images, demos and CI files; each keeps its LICENSE (jevwire's and toolgate's come from their repository root). Canny and rtk are installed on each machine by `mac-setup.sh` or `cloud-setup.sh`.
