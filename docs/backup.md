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

**Not readable from here, so not stated as fact:** whether the Point-in-Time Recovery add-on is switched on, and how
many days the project can be restored back to. The Supabase connector exposes no backups endpoint and no Management
API token is in this environment. Without the add-on, a Pro plan keeps the last 7 daily backups; with it, 7, 14 or 28
days to the second. **Nimish reads it** at Database → Backups in the Supabase dashboard and writes the number here.

How a restore is done: Database → Backups in the dashboard, pick the backup or the moment, confirm; the project is
unreachable while it restores. Custom roles' passwords are not in a backup and are reset after.

## The box's data folder (AWS Lightsail, Mumbai)

The engine's server holds, outside the database, every scan (`~/cornerstone/assessments`) and every paper it rendered,
the library's worksheets and the print packs (`~/cornerstone/data`; `deploy/compose.server.yml`). Lightsail keeps a
server's disk by automatic snapshots, one a day, the newest 7 kept, when the add-on is switched on for the instance.

**Not readable from here, so not stated as fact:** whether the instance's automatic-snapshot add-on is on, and so what
the retention is. The AWS credentials in this environment belong to the Textract user, which Lightsail refuses
(`lightsail:GetInstances` not authorised). **Nimish reads it** at Lightsail → the instance → Snapshots, or runs
`aws lightsail get-instances --profile cornerstone` on his Mac, and writes it here.

## The restore drill (run once, 2026-11-09)

Onto the test database, which holds no child (built by `bin/testdb fresh` from the migrations and the seed alone):

1. `pg_dump --format=custom` of the test database `engine_test`: 7,905,585 bytes.
2. `create database engine_restore`, then `pg_restore --no-owner --exit-on-error` of that dump into it.
3. Every table's row count compared between the two: 165 tables, 100,418 rows, every count equal.

The same two commands restore a Supabase daily backup, downloaded from the dashboard, onto a laptop's Postgres; that
file holds children's names (`pii`), so it is deleted as soon as it is restored, as `bin/testdb` deletes its own.

## Retention beside the voice promise

The longest retention anyone can rely on today is the database's: the 7 daily backups Supabase keeps on a Pro plan,
longer only if the Point-in-Time add-on is on (the line above Nimish fills in). A K2 voice note's raw audio and raw
transcript are promised gone after **48 hours** (`voice.confirm_within_hours`, a config row, is 48; `docs/backend-plan.md`
rule 1). A database backup taken while a raw copy was still inside the 48 hours holds that copy for as long as the
backup is kept: up to 7 days, or the add-on's retention. The promise therefore holds on the live database and not yet
on its backups; `voice.audio_retention_days` is still null (nothing deletes audio until it is a number), so today no
audio is deleted at all, and that is CP-10's to build.
