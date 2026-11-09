# Backup and restore

What is backed up, how long it is kept, and the one drill that shows a restore works (CP-24, audit F10). Every fact
here says where it was read. A line that could not be read from here says **not confirmed** and names who reads it. No
retention length below is known: none has been read from a dashboard or given by Nimish.

## The database (Supabase, project `cornerstone-cloud`, Mumbai `ap-south-1`, Postgres 17.6)

Read from the live project's own settings on 2026-11-09 (`select name, setting from pg_settings`, through the Supabase
connector; the project's size that day: 261 MB):

| Setting | Value | What it means |
|---|---|---|
| `archive_mode` | `on` | every write-ahead log segment is archived off the server |
| `archive_command` | `/usr/bin/admin-mgr wal-push %p` | the archiver is WAL-G, Supabase's point-in-time tool |
| `archive_timeout` | `120` | a segment is pushed at least every 2 minutes, so at most 2 minutes of writes can be lost |
| `wal_level` | `logical` | the log holds enough to replay every change |

So the log is archived off the server every two minutes or sooner. That is all the settings show.

| Fact | Status |
|---|---|
| Supabase daily backups kept | **not confirmed** |
| Point-in-Time Recovery add-on switched on, and how many days the project can be restored back to | **not confirmed** |

**Nimish to read from the dashboard and write the numbers here.** The Supabase connector exposes no backups endpoint and
no Management API token is in this environment. Look at **Supabase dashboard → project `cornerstone-cloud` → Database →
Backups**: the *Scheduled backups* tab lists the daily backups kept, and the *Point in time* tab shows the recovery
period if the add-on is on.

How a restore is done: Database → Backups in the dashboard, pick the backup or the moment, confirm; the project is
unreachable while it restores. Custom roles' passwords are not in a backup and are reset after.

## The box's data folder (AWS Lightsail, Mumbai)

The engine's server holds, outside the database, every scan (`~/cornerstone/assessments`) and every paper it rendered,
the library's worksheets and the print packs (`~/cornerstone/data`; `deploy/compose.server.yml`).

| Fact | Status |
|---|---|
| Automatic-snapshot add-on switched on for the instance | **not confirmed** |
| Snapshot retention, in days | **not confirmed** |

**Nimish to read from the console and write the retention here.** The AWS credentials in this environment belong to the
Textract user, which Lightsail refuses (`lightsail:GetInstances` not authorised). Look at **AWS Lightsail console
(Mumbai) → the engine's instance → Snapshots tab → Automatic snapshots**: it shows the time of day and the snapshots
kept. Or on his Mac, `aws lightsail get-instances --profile cornerstone`.

## The restore drill (run 2026-11-09)

Run in this session's cloud sandbox (Postgres 16.15, not Supabase), onto throwaway databases that hold no child. The source
was a test database, built by `bin/testdb fresh` from the repository's migrations and the seed alone (the same build CI uses):

1. `pg_dump --format=custom` of the source database: 8,003,172 bytes.
2. A new empty database, then `pg_restore --no-owner --exit-on-error` of that dump into it.
3. Every table in `public` and `pii` counted in both: 170 tables, 100,429 rows, every count equal; 0 children in the source.

These figures were measured by that run and are not a measure of Supabase's own backups, which have not been restored
from. The same two commands restore a Supabase daily backup, downloaded from the dashboard, onto a laptop's Postgres;
that file holds children's names (`pii`), so it is deleted as soon as it is restored, as `bin/testdb` deletes its own.

## Retention beside the voice promise

A K2 voice note's raw audio and raw transcript are deleted **48 hours** after the note was received (CP-10:
`voice.confirm_within_hours`, a config row, is 48, and is the one key for both how long a note waits and how long its raw
copies are kept; `docs/backend-plan.md` rule 1). What the educator confirmed stays; only the raw copies go.

That deletion holds on the live system. **The backups are not confirmed.** A backup taken while a raw copy was still
inside those 48 hours holds that copy for as long as the backup is kept, and how long the database backups and the box's
snapshots are kept is not confirmed (the two tables above). So whether the backup length is longer or shorter than 48
hours is unknown. Whether any gap is acceptable, or the backups need a shorter retention, is Nimish's call once the
numbers above are filled in.
