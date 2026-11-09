# n8n — the control plane, and nothing else

n8n triggers, sequences, waits, notifies and moves files. It never decides anything about
teaching. Every decision — which units are short, how many questions to make, whether an item is
any good — lives behind an engine endpoint and is called from here (CLAUDE.md rule 3, ADR 0003).

`lint.py` enforces that. Run it on every exported workflow before committing:

```
python n8n/lint.py n8n/workflows/*.json
```

It fails on a Code or language-model node, on parameter text that reads like a prompt, on a
literal credential in a header or body, and on a workflow with no trigger. It deliberately does
not police sticky notes or the wording of a notification: neither is executed, so neither can
hide a rule.

## F1 — build the bank (`workflows/f1-build-the-bank.json`)

W1 gate 5. Live at `https://cornerstoneschool.app.n8n.cloud/workflow/F0i4ylZkD8zpOfH0`.

```
Every morning 06:00 ─┐
                     ├─→ GET /bank/coverage?short_only=true
A skill set changed ─┘      (the engine decides what "short" means)
                              │
                              ▼  one unit at a time
                     POST /bank/fill            keyed <unit>-<date>, so a retry cannot double-fill
                              ▼
                     POST /bank/review  language_review
                              ▼
                     POST /bank/review  pedagogy_review
                              ▼
                     not_passed > 0 ?  ── no ──→ next unit
                              │ yes
                              ▼
                     email a person ──→ next unit
```

Nothing in this flow retires an item. A reviewer's verdict is advice; it lands in `item_review`
and waits for a person to agree or overrule it.

## F4 — rebuild the picture every night (`workflows/f4-nightly-graph.json`)

CP-9. A schedule at 02:30 IST, then one `POST /graph/nightly` keyed `nightly-<date>`. The engine rebuilds every child's
picture from confirmed evidence and writes one row to the `graph_run` ledger. **Not live until someone imports it into
n8n on the box and attaches the engine key credential.** CP-9's live proof (`1b`) fails until a run is logged.

## F5 — delete old voice recordings and transcripts (`workflows/f5-voice-cleanup.json`)

CP-10. A schedule every hour, then one `POST /voice/cleanup` keyed `voice-cleanup-<UTC date-hour>`. The engine deletes the
recording and the transcript of every voice note older than `voice.confirm_within_hours` (48), keeps what the educator
confirmed, and writes one `flow_run` row (counts only). A failed run is retried by the next call, even in the same hour.
It runs whether or not the voice switches are on. **Not live until someone imports it into n8n on the box and attaches
the engine key credential**; until then nothing deletes a recording. `engine read voice status` shows the last run.

## Before it can run

Two credentials must be created by hand in n8n — this repo never holds them:

1. **Engine key** (`httpTemplatedCustomAuth`) — template
   `{"headers": {"X-Engine-Key": "{{api_key}}"}}`, with `api_key` set to `ENGINE_KEY` from `.env`.
2. **School mail** (`smtp`) — the sender for the "ask a person" step.

The engine must be reachable at `http://engine:8000`, which is what `deploy/compose.yml` gives it
when both run under the same compose project. A cloud n8n reaching a locally-hosted engine needs
a tunnel or a deployed engine instead — that is a deployment decision, not a workflow change.

## Importing this file into a fresh n8n

Workflows are reviewed in PRs like code. The JSON here is the source of truth; import it rather
than hand-editing the canvas, and re-export after any change made in the UI:

```
n8n import:workflow --input n8n/workflows/f1-build-the-bank.json
```
