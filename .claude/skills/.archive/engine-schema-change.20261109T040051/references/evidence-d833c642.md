database-access-rules [project]: Use when proving Postgres row-level security or grants.
Body line: "Unlisted tables default to closed for the restricted role, and a test fails until someone classifies each new table."
Body line: "Default privileges already give app_engine select, insert, update and delete, and app_web select, on new public tables."