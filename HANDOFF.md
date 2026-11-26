# HANDOFF

_Overwritten at the end of every session. Keep under 30 lines. Facts only._

**Updated:** 2026-11-26 · **By:** Coordinator (loop:run, side session) · **Model:** claude-opus-5-5
**Milestone:** M6 K1 pilot (Nimish presents to the K1 educator 26 Nov) · **Branch:** plan/handoff

## State (live)
- K1-A Gurukul: 21 children (ADR 0112), educator + class_teacher Radhika (radhika@cornerstoneschool.in).
- F.N 10 W1+W2 loaded: 99 lessons, 48 plan lines (`engine timetable load-k1`; CSVs in ~/cornerstone/private/k1_fn10/).
- 9 lessons have a school-chosen activity (tt_edit.edit as nimish@cornerstoneschool.in): 26 Nov hindi F004, beads 1146; 27 story 0975; 1-4 Dec stories, dustbin, swar, beads.
- S3 checked in Chrome as Nimish on 26 Nov beads lesson: rubric 0-3, 21 children, Type the marks, Record. No mark saved; Radhika's sign-in not checked.
- Voice: SARVAM_API_KEY NOT on server. Nimish runs `bash ~/cornerstone/private/set-voice-key.sh`; "No retention" in Sarvam first.
- Server route: AWS profile cornerstone -> lightsail default key -> ssh ubuntu@3.111.248.87 -> `docker exec deploy-engine-1 engine ...`.

## Next step
1. `loop plan` job (branch plan/k1-pilot-offers, running in the main checkout): timetable.heads so 8 refused choices are offered, F001-F006 skill links, observed.weights K1. Check its PR, CI, review, merge, then re-run attach for 11-26 rhyme F001, 11-27 art 1202, 11-30 rhyme 0665 / trace D F003 / animals 0630, 12-01 bottles 0783 / rhyme 0665, 12-02 trace 6 F002.
2. Tick G6.5 (99 lessons live) and G6.6 in PROJECT.md.
3. Follow-ups (tickets): educator chooses activity on S3 (coordinator-only today); voice confirm should default to the lesson's activity; recorder 30 s cap; voice failure is silent; #948 review notes (_fill_birthday no-op write, mixed blank/filled birthday duplicate, test not in core.txt); "enrol k2" labels; ADR 0108 ticket 4 is an unproven path, not a code gap.

## Don't repeat
- `loop build` passes --allowedTools space-joined: builder shell calls are denied. Use the loop:builder(-small) subagent.
- Past days and not-planned lessons refuse an activity; set it before the day.
- Passwords and API keys are typed by Nimish, never by the session.
