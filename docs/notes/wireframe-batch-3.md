# Wireframe batch 3: today-coordinator, assessments, assessment, paper

Branch `cp-27-wireframe-batch-3`, from `cp-27-wireframe-revision-1` (PR #553). Docs only.

## Verified
- `node docs/frontend/wireframes/check.mjs`: all 15 wireframes PASS, all clear. `--gaps`: all clear.
- Rendered at 1440 and 400 (light): no sideways scroll of the page at 400. Not run: dark theme, the app.

## Not done
- staff, classes, setup, curriculum: not drawn this session.

## Judgement calls (Nimish to confirm)
- **ChildPeek is not drawn on `assessment` or `paper`.** Their elements list no peek or child name, and adding one changes the agreed element inventory. Copies are shown by Sr. No. only. Say if you want peeks there.
- **`today-coordinator` has no Table | Board toggle.** Its elements list none, and its rows are kinds of work, not items moving through stages.
- **`assessment` is drawn mid-flow** (first pack printed and being checked, a second pack of two copies awaiting approval) so every element in its list can appear. Approve is main because `actionOf` puts approval first for a home assessment; Print is shown off.
- **`paper` draws Sign this paper off in an inset**, because the live page shows it only when nothing is left to judge.
- Kit additions (own commits): HeatGrid cell as a link and a dashed holiday cell, a scroll box for the heat grid, `.split` and an outlined answer on PageImage, board lanes from 220 px so four fit at 1440.
- `screens.json` `paper.purpose` was 201 characters (limit 140); shortened, SPEC.md regenerated. `confirm`, `timetable` and `fortnight` are also over 140 and left alone.
- The Assessments Clear control is not drawn: its elements list only the filters.
