# Backup and restore

What is backed up, how long it is kept, and the one drill that shows a restore works (CP-24, audit F10). Every fact
here says where it was read; a line that could not be read from here says so and names who reads it. Nothing here is
guessed.

## The database (Supabase, project `cornerstone-cloud`, Mumbai `ap-south-1`, Postgres 17.6)

Read from the live project's own settings on 2026-11-09 (`select name, setting from pg_settings`, through the Supabase
connector; the project's size that day: 261 MB):

| Setting | Value | What it means |
|---|---|---|
| `archive_mode` | `on` | every write-ahead log segment is archived off the server |
| `archive_command` | `/usr/bin/admin-mgr wal-push %p` | the archiver is WAL-G, Supabase's point-in-time tool |
| `archive_timeout` | `120` | a segment is pushed at least every 2 minutes, so at most 2 minutes of writes can be lost |
| `wal_level` | `logical` | the log holds enough to replay every change |

So the project is on Supabase's physical backup and WAL archive (the default for every project on Postgres 15.8 or
newer, per Supabase's backup guide), with a daily base backup and the log pushed every two minutes.

**Not known, Nimish to read from the dashboard:** whether the Point-in-Time Recovery add-on is switched on, and how many
days the project can be restored back to. The Supabase connector exposes no backups endpoint and no Management API token
is in this environment. Look at **Supabase dashboard → project `cornerstone-cloud` → Database → Backups**: the
*Scheduled backups* tab lists the daily backups kept (a Pro plan keeps 7), and the *Point in time* tab shows the recovery
period if the add-on is on (7, 14 or 28 days, to the second). Write the number here.

How a restore is done: Database → Backups in the dashboard, pick the backup or the moment, confirm; the project is
unreachable while it restores. Custom roles' passwords are not in a backup and are reset after.

## The box's data folder (AWS Lightsail, Mumbai)

The engine's server holds, outside the database, every scan (`~/cornerstone/assessments`) and every paper it rendered,
the library's worksheets and the print packs (`~/cornerstone/data`; `deploy/compose.server.yml`). Lightsail keeps a
server's disk by automatic snapshots, one a day, the newest 7 kept, when the add-on is switched on for the instance.

**Not known, Nimish to read from the console:** whether the instance's automatic-snapshot add-on is on, and so what the
retention is. The AWS credentials in this environment belong to the Textract user, which Lightsail refuses
(`lightsail:GetInstances` not authorised). Look at **AWS Lightsail console (Mumbai) → the engine's instance → Snapshots
tab → Automatic snapshots**: it shows the time of day and the snapshots kept. Or on his Mac, `aws lightsail
get-instances --profile cornerstone`. Write the retention here.

## The restore drill (run once, 2026-11-09)

Onto the test database, which holds no child (built by `bin/testdb fresh` from the migrations and the seed alone):

1. `pg_dump --format=custom` of the test database `engine_test`: 7,905,585 bytes.
2. `create database engine_restore`, then `pg_restore --no-owner --exit-on-error` of that dump into it.
3. Every table's row count compared between the two: 165 tables, 100,418 rows, every count equal.

The same two commands restore a Supabase daily backup, downloaded from the dashboard, onto a laptop's Postgres; that
file holds children's names (`pii`), so it is deleted as soon as it is restored, as `bin/testdb` deletes its own.

## Retention beside the voice promise

The longest retention anyone can rely on today is the database's: the 7 daily backups Supabase keeps on a Pro plan,
longer only if the Point-in-Time add-on is on (the line above, which Nimish fills in). A K2 voice note's raw audio and raw
transcript are deleted **48 hours** after the note was received (CP-10: `voice.confirm_within_hours`, a config row, is 48,
and is the one key for both how long a note waits and how long its raw copies are kept; `docs/backend-plan.md` rule 1).
A database backup taken while a raw copy was still inside those 48 hours holds that copy for as long as the backup is
kept: up to 7 days, or the add-on's retention. So the promise holds on the live database and not on its backups, and the
gap is the backup retention (7 days or more) against 48 hours. What the educator confirmed stays; only the raw copies go.
Whether that gap is acceptable, or the backups need a shorter retention, is Nimish's call once the two lines above are filled in.
