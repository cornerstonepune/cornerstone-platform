-- CP-37: the fifth question to answer that wrote a date the wrong way. MD.A4's "why" said "24 Jul"; the site's word test
-- (u43 "a date is one format on every page") wants the school's form, 24-Jul-2026. The year is the one of the school's July
-- quiz as the other rows date it (2026): worded by the backend orchestrator, unverified against the quiz itself.
-- Same guard as CP-36's migration: one field of one row, only while it still holds exactly the old words; an answer is
-- not touched; a database built from the repository loads the new words and finds nothing to change here.
update ask set why = $w$The school's 24-Jul-2026 quiz asks 11 × 4 and 12 × 5; the Grade 4 paper asks 144 ÷ 12.$w$, updated_at = now()
where code = 'MD.A4' and why = $w$The school's 24 Jul quiz asks 11 × 4 and 12 × 5; the Grade 4 paper asks 144 ÷ 12.$w$;
