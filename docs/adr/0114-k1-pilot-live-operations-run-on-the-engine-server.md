# 0114 — K1 pilot: live operations run on the engine server

Date: 2026-11-26. Status: accepted (Nimish: "Use the server", "just load it").
Goal: none — records how live data was written for the K1 pilot.

## Context
The Mac's `.env` points at a local test database; the enrolment, week load and activity choices had to reach live the same day.

## Decision
- Run engine commands inside `deploy-engine-1` on the engine server, reached with the AWS profile `cornerstone` (Lightsail default key, temporary file, deleted after). Never hand-written SQL.
- A class list (child names) is copied to the server only for the command, then deleted from the host and the container. It stays outside git (`~/cornerstone/private/`).
- Lesson activities are chosen through the engine's own `tt_edit.edit`, recorded under Nimish's staff id.
- The F.N 10 calendar capture used the live sheet's values where the committed capture was stale.
- Passwords and API keys are typed by Nimish himself (staff add prompt; `~/cornerstone/private/set-voice-key.sh` for the voice key).

## Consequences
No runbook or workflow exists for this yet; one is wanted before the next class. A deploy during a running command kills it.
