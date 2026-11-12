**In plain words (for Nimish):** today the coordinator can move or swap K2 lessons, but cannot change what a lesson says (its topic) or which subject it is. This adds that one edit, on planning and live fortnights alike, with the same safety as moves: past days cannot be changed, a fortnight past planning asks for a reason, and every edit is kept in the history with the old and new words. Approve with a comment "approved".

Nimish, 11 Nov 2026: "While one fortnight can be live, at every place, the timetable should still be editable." K2 only for now.

## What
An engine route `POST /timetable/lesson/edit` `{session_id, text?, subject_code?, reason?}` that changes one dated lesson (`session`) — its topic text and/or its subject — and a coordinator's Edit action on every timetable view that calls it. Moves stay on the existing `POST /timetable/move` (CP-12).

## Done when
1. A member of the go-live group (`timetable.go_live_group`) changes a lesson's topic text on a fortnight in `planning`; the lesson keeps its id, plan line and materials links, and the new text shows on the day, week and fortnight views.
2. The same edit on a fortnight past planning (aligned/approved/frozen/live) is refused without a reason and done with one (the freeze rule of `fortnight_cycle.ensure_editable`, as `tt_move` uses).
3. An edit of a lesson on a day already past, on a holiday, or on a fixed period is refused, names its reason, and writes nothing.
4. A subject change accepts only a subject the class is taught (from the registry/table, nothing hard-coded) and is refused otherwise.
5. Every edit writes one `change_log` row (`session`, op `edit`, old and new text/subject, who, reason); nothing is updated in place without that row.
6. An educator (not in the group) is refused (403) and sees no Edit action; the coordinator sees Edit on the Timetable home (Live and Planning), day, week and fortnight views.
7. One Playwright spec: coordinator edits a planning lesson's topic and sees it; educator sees no Edit.

## Out of scope
Other grades; adding or deleting lessons; editing the frame or the rules; writing back to the Google sheet; any migration or new table (`change_log` already covers history — if it does not, stop and say why in this issue).
