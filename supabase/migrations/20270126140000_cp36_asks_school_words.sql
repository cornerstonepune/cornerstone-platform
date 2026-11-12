-- CP-36: four "questions to answer" are worded in the school's own date and grade words (a date as 09-Oct-2026, a grade as
-- Grade 1 to Grade 4), as supabase/seed/asks.json now words them. Nimish, 12 Nov 2026: "reword the four asks rows (MD.A1,
-- A6, A7, A8) in the school's date and grade words, in the seed and on live."
-- Why a migration: the loader rewords only a question nobody has answered and deploy loads settings only, and MD.A1 is
-- answered on live, so its words stand to the loader. Each update changes one field of one row, and only a row still
-- holding exactly the old words; the answer, who answered and when are not touched. A row someone has reworded since is left
-- alone; a database built from the repository loads the new words and finds nothing to change here.

update ask set why = $w$Nimish, 09-Oct-2026: "consider all of the methods for now". A level's methods are a row, so a grade that teaches one method narrows it without code.$w$, updated_at = now()
where code = 'MD.A1' and why = $w$Nimish, 2026-10-09: "consider all of the methods for now". A level's methods are a row, so a grade that teaches one method narrows it without code.$w$;

update ask set drafted = $w$Registry LO-G1-0046 to 0055, LO-G2-0492 to 0498 and 0527 to 0530, LO-G3-0942 to 0944 and 0956 to 0959, LO-G4-1339 to 1356, and the July papers. 4-digit × 1-digit, 3-digit × 2-digit and division by a 2-digit number beyond ÷12 are in no Grade 1 to Grade 4 objective: they are here, placed in no grade. Where the lists disagree (one "Extended & Application" unit is repeated in Grade 2, Grade 3 and Grade 4), a level goes to the earliest grade whose objective names it, except Grade 1, which is exactly what its educator taught to the end of September (06-Oct-2026): equal groups by adding again. A level the objectives put in Grade 1 sits in Grade 2 until the Grade 1 educator says it is taught.$w$, updated_at = now()
where code = 'MD.A6' and drafted = $w$Registry LO-G1-0046 to 0055, LO-G2-0492 to 0498 and 0527 to 0530, LO-G3-0942 to 0944 and 0956 to 0959, LO-G4-1339 to 1356, and the July papers. 4-digit × 1-digit, 3-digit × 2-digit and division by a 2-digit number beyond ÷12 are in no G1 to G4 objective: they are here, placed in no grade. Where the lists disagree (one "Extended & Application" unit is repeated in G2, G3 and G4), a level goes to the earliest grade whose objective names it, except Grade 1, which is exactly what its educator taught to the end of September (2026-10-06): equal groups by adding again. A level the objectives put in Grade 1 sits in Grade 2 until the Grade 1 educator says it is taught.$w$;

update ask set why = $w$The Grade 1 rule of 06-Oct-2026.$w$, updated_at = now()
where code = 'MD.A7' and why = $w$The Grade 1 rule of 2026-10-06.$w$;

update ask set why = $w$No Grade 1 to Grade 4 objective names them.$w$, updated_at = now()
where code = 'MD.A8' and why = $w$No G1 to G4 objective names them.$w$;
