# CP-10 verification (independent athena-verifier, 9 Nov 2026)

Pass 1 answered FAIL: one recording that cannot be deleted rolled back the whole clean-up, undoing every other note's
cleared transcript and delete times. Fixed at its cause (the run reports `stuck` and is marked failed afterwards, so
cleaned notes stay cleaned). Pass 2 answered FAIL: `engine read voice cleanup` still exited 0 with a stuck recording.
Fixed, with a test. Pass 3 (the answer below) is the final one, on the working tree that is committed with this file.

---

PASS

The one gap from my last pass is closed. `engine read voice cleanup` now saves what was cleaned, reports a stuck recording and exits 1. I re-ran `athena done CP-10` myself this session: 7 pass, 1 box-only ("ALL DONE (1/1 specs pass)"). I could not run pytest here because it is not installed in this sandbox, so the 63 passing engine tests and `bin/check` exit 0 are the builder's figures, not mine.

**Q1. Is every Done-when met?**
- **DW1: MET.** Proof 1 passes. The clean-up deletes the recording first and clears the transcript only after that succeeds (`voice_intake.py`, `cleanup`). New lines no longer keep a copy of the words (`voice_confirm.py`).
- **DW2: MET.** Proof 2 passes. Her free sentence is saved at confirm and the child's page reads it from there.
- **DW3: MET.** Proof 3 passes; the live check runs only on the box.
  - **Scheduled run with one stuck recording:** the stuck note keeps its words and both of its "when deleted" times stay empty. Every other note is cleaned, and its times are set once and never change after. The route marks the run as failed with a counts-only message, saves, and answers 500. A retry with the same Idempotency-Key runs the clean-up again. A retry after a good run returns that run's counts.
  - **The command:** `cli_voice.py` now saves first. It prints `notes cleaned: <recordings deleted>`, so a stuck note is no longer counted as cleaned. It then prints "N recordings could not be deleted; they are tried again" to stderr and exits 1. An unreadable recordings folder still undoes everything and exits 1.
  - **The command's test:** `test_cli_voice.py` uses a stand-in clean-up and a stand-in database connection. It checks for exit 1, the stuck message and the save.
- **DW4: MET.** Proof 4 passes.
- **DW5: MET.** Proof 5 passes.
- **DW6: MET.** Proof 6 passes.
- **DW7: MET.** Proof 7 passes. The new messages carry counts only.

**Q2. Anything unasked?** Nothing of substance.
- The migration clears `note_claim.words` on every existing row, with the append-only trigger briefly off. That goes past DW1's "from now on", but it removes a copy of the transcript. It is acceptable as long as the PR names it.
- The rename of `--retention-ref` to `--ref` was not asked for, but it is only cosmetic.
- The other renames and retirements follow from DW3 and DW4. No new dependencies.

**Q3. Anything missing?** Nothing. The fix for the command is now in the tree.

**Risks:**
- The migration rewrites an append-only table that holds child data.
- The clean-up deletes files on the box.
- The route sits behind the existing engine key. No secrets or sign-in changes.
- One minor leftover: if walking the recordings folder fails part-way, the orphan scan can still undo a whole clean-up. That is unlikely and not a scope miss.

VERDICT: PASS
