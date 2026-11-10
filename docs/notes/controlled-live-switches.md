# The screens go on by a signed, logged command (founder, 10 Nov 2026: all screens on)

Nothing set `educator.timetable_enabled` or `curriculum.screens_enabled` except hand SQL, and the cloud sessions have no write path to live. Now:

- `engine read voice switch timetable|curriculum on|off --by <email>` joins `screens|recording|sarvam`: same signing (the staff id of `--by`), same `access_log` line.
- Three fixed runs in the existing `curriculum run` workflow (`.github/curriculum/command.py`, dispatched by hand, the dispatcher looked up in `CURRICULUM_STAFF`): `switch_status` (which screens are on), `switch_screens_on` (voice screens, timetable, curriculum), `switch_recording_on` (its own run: a child's voice reaches a speech service, live has 0 consents on record).
- The server must have this code first (`deploy engine` after the merge), then the run is dispatched. Unverified: that the dispatcher has an entry in `CURRICULUM_STAFF`.

Verified: `tests/test_voice_switch.py`, `test_curriculum_run_command.py`, `test_timetable_run_command.py`, layout, `bin/check` on a fresh Postgres 16. Not verified: CI's full suite; a real dispatch.
