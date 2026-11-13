-- CP-50: K2 children who arrive after 09:00 count as late. `attendance.start_times` was seeded empty (CP-42), so no late
-- count showed anywhere. The seed now holds {"K2": "09:00"}. The seed loader never overwrites a live row (`seed_once`),
-- so this brings live's row across, and only while it is still exactly the empty value the seed first wrote: a time the
-- school has set is left alone. No table, column or function. Written to run twice.

update config
set value = '{"K2": "09:00"}'::jsonb,
    updated_at = now()
where key = 'attendance.start_times'
  and value = '{}'::jsonb;
