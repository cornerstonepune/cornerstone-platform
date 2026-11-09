# Restarting the throwaway test Postgres

The test cluster is a local data directory built by `bin/testdb fresh`. A session resume stops the server but keeps the data.

## Check

    pg_isready -h 127.0.0.1 -q || echo "POSTGRES DOWN"

A refused connection ("Connection refused" on port 5432) means the server is stopped. Look for the data directory before rebuilding anything.

## Restart

Remove a stale lock file, then start the server as the postgres user, with the socket in the cluster folder and bound to localhost:

    D=/tmp/cp6pg; rm -f $D/data/postmaster.pid; su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $D/data -l $D/log -w start -o '-p 5432 -k $D -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off'"

The fsync and synchronous_commit settings are for this throwaway cluster only; never use them on a real database.

If the data directory is gone, rebuild it with `bin/testdb fresh`.

## Run a fresh database per proof

Create a copy of the base template, apply the migration under test with the error stop flag, and read back what the migration seeds:

    psql postgresql://postgres:postgres@127.0.0.1:5432/postgres -qc "create database cp6_v template cp6_base"
    psql postgresql://postgres:postgres@127.0.0.1:5432/cp6_v -q -v ON_ERROR_STOP=1 -f supabase/migrations/20270125120000_fortnight_cycle.sql

Then export `TEST_DATABASE_URL` for the one command that needs it, for example `athena done CP-6`.
