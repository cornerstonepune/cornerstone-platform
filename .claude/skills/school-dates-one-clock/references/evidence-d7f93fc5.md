- **A new ordinary test** (`tests/test_one_clock.py`) fails if engine, `apps/web/lib` or `apps/web/app` source holds
  `date.today(`, a zone-less `datetime.now()` or `current_date`.
- **Left on purpose, not school dates:** `voice_intake.receive` takes the storage key's year from `datetime.now(dt.UTC)` (a
  folder name)