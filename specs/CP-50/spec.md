Approved in content by Nimish on 13 Nov (backend session `session_01KEBF26wBpCSaruLeDNyA7v`: "K2 late cutoff 9 am"). The live step needs his word again in the session that merges it.

## Why

Attendance (CP-42) counts a late arrival only for a program with a start time in the setting `attendance.start_times`. It is empty, so no late count shows anywhere. Live, read-only, 13 Nov: K2 has 1,330 present days loaded; 76 of them (5.7%) arrived after 09:00.

## What

The setting holds `{"K2": "09:00"}`: a K2 child whose in-time is after 09:00 is late. One guarded migration brings live's row across only while it is still exactly the empty value the seed first wrote; a value the school has set is left alone. The seed carries the same value and an updated description. No table, column or function.

## Done when

1. The seed's `attendance.start_times` is `{"K2": "09:00"}` and nothing else. (Test.)
2. The migration sets live's row only while it is exactly `{}`; a row the school changed is left alone; running it twice is the same. (Test.)
3. With the setting, a K2 child's month counts an arrival at 09:01 as late and one at 09:00 as not late. (Test.)
4. LIVE (after Nimish's word): the setting reads `{"K2": "09:00"}`; latest migration is this one; table count unchanged. Counts only.

## Out of scope

Start times for other programs (Grade 3, Daycare: to ask the school). Any screen change. A grace period.
