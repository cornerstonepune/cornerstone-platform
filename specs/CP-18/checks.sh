#!/usr/bin/env bash
# Acceptance proofs for CP-18. Written BEFORE the product code, by a different agent.
# After `athena lock CP-18` this file, spec.md and proofs/ cannot be edited.
# One `check` per "Done when" line, same numbering. Each check must be a real command.
source "$ATHENA_ROOT/.claude/athena/bin/checklib.sh"
cd "$ATHENA_ROOT"

# 2-7 use TEST_DATABASE_URL (the throwaway database of GitHub's athena job, CP-20) or build their own from every
# migration in a temp folder; DATABASE_URL from .env is overwritten and every SMTP_* variable removed, so nothing reaches
# the live database or a mail server. Fake staff, contacts and classes only. Most proofs roll back; the ones that run
# deliver_due or `engine reminders --deliver` (which commit) delete what they wrote.
# CP-17's approval and CP-6's fortnight steps are not built: their assumed interfaces are named once, in
# proofs/conftest.py (approve, fortnight_step, fortnight_state); the checks that need them say so.
# 1 reads the committed record (decisions log, prompts.json, thresholds.json, the gold set); its LIVE part and 8 are box
# only, read-only counts.
PY=packages/engine/.venv/bin/python
P=specs/CP-18/proofs
T="$PY -m pytest -q -p no:cacheprovider --rootdir=$P"

check "1 note-reading prompt scored on >= the lines bar (60) incl. a photographed note, each bar in the decisions log, the scored version is the one on" \
  $T $P/test_prompt_scored.py
check_box "1 LIVE the active materials_read version on the live database is the scored one" \
  $PY $P/live_prompt.py
check "2 a list is sent only when approved as it reads now; a combined list with an unapproved class is refused naming it (needs CP-17)" \
  $T $P/test_approval.py
check "3 every send records who, text, when and the staff member; none named or no number: not configured, list unsent, reminders on (needs CP-17)" \
  $T $P/test_send_record.py
check "4 a combined list of exactly one fortnight marks it list sent with the same who and when (needs CP-6 and CP-17)" \
  $T $P/test_fortnight_list_sent.py
check "5 each due reminder emailed once per person or recorded why not; never twice, even in two runs; none after a send or past the day (one case needs CP-17)" \
  $T $P/test_reminders.py
check "6 no phone, email or name in any log, send record or delivery record (sends need CP-17)" \
  $T $P/test_no_contact_in_logs.py
check "7 no proof sends a real message; with no sending account delivery records not configured and contacts nothing" \
  $T $P/test_no_real_message.py
check_box "8 LIVE per fortnight: a real send with a recipient, a reminder delivered, no due reminder without a record" \
  $PY $P/live_counts.py

finish
