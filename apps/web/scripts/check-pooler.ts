// The live Question bank hung for Vercel's full five minutes on every click (ADR 0024): through
// Supabase's transaction pooler, a third query stacked on one connection never answers. This asks
// eight questions at once through that pooler, with the app's own `lib/db.ts` exactly as a Vercel
// function builds it, and fails if any of them has not answered within 15 seconds.
//   cd apps/web && node scripts/check-pooler.ts
// It only runs `select now()` — nothing is read from or written to any table. The query carries no
// value on purpose: postgres.js waits after a query with values (it asks the server for their
// types first), so only value-less queries stack — and the Question bank's counts are value-less.
//
// CP-2 (ADR 0100): with CHECK_POOLER_URL set (the pooler's address; required by the CP-2 proof, which fails without it)
// it also proves a request says who is asking and the identity never leaks to the next request on the shared connection:
// A, B, nobody x200 in alternation; A and B at the same time; after a failed query; after a query that timed out.
// Read-only: public.current_staff() and pg_backend_pid(); no table is touched.
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import path from "node:path";

const rootEnv = path.resolve(import.meta.dirname, "../../../.env");
if (!process.env.DATABASE_URL && !process.env.CHECK_POOLER_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const address = process.env.CHECK_POOLER_URL ?? process.env.DATABASE_URL;
if (!address) {
  console.error("DATABASE_URL is not set — the check needs the live database's address.");
  process.exit(1);
}
// The road a deployed page takes: the transaction pooler, in a serverless function.
process.env.DATABASE_URL = address.replace(":5432/", ":6543/");
process.env.VERCEL = "1";
// One connection for the identity proof, so A, B and nobody really do share it. (The stacking check then runs on that one
// connection too; run it without CHECK_POOLER_URL for the app's own pool size.)
if (process.env.CHECK_POOLER_URL) process.env.DB_POOL_MAX = "1";

const { sql, whoIsAsking, IDENTITY_SETTING } = await import("../lib/db.ts");
const N = 8;
let answered = 0;
const timer = setTimeout(() => {
  console.error(`${answered} of ${N} answered after 15 s — queries stacked on one connection are hanging (ADR 0024)`);
  process.exit(1);
}, 15_000);

await Promise.all(Array.from({ length: N }, () => sql`select now() as n`.then(() => answered++)));
clearTimeout(timer);
console.log(`${answered} of ${N} answered`);

if (process.env.CHECK_POOLER_URL) {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const who = new AsyncLocalStorage<string | undefined>();
  whoIsAsking(async () => who.getStore());
  const pids = new Map<string, Set<number>>();
  const failures: string[] = [];

  const seen = async (id: string | undefined, label: string) => {
    // The setting itself, read back, so this runs on the live pooler before the migration is deployed. A value that is
    // unset reads as null or, once a transaction has set it on a backend, as ''.
    const [row] = await who.run(id, () =>
      sql<{ s: string | null; pid: number }[]>`select nullif(current_setting(${IDENTITY_SETTING}, true), '') as s, pg_backend_pid() as pid`,
    );
    const want = id ?? null;
    if (row.s !== want) failures.push(`${label}: expected ${want}, saw ${row.s}`);
    const key = id ?? "nobody";
    pids.set(key, (pids.get(key) ?? new Set()).add(row.pid));
  };

  for (let i = 0; i < 200; i++) for (const id of [A, B, undefined]) await seen(id, `alternation ${i}`);
  console.log("alternation: 600 requests (A, B, nobody x200) done");

  await Promise.all(Array.from({ length: 60 }, (_, i) => seen([A, B, undefined][i % 3], `concurrent ${i}`)));
  console.log("concurrent: 60 requests done");

  await who.run(A, () => sql`select 1/0`).then(() => failures.push("a failing query did not fail"), () => {});
  await seen(undefined, "after a failed query");
  await seen(B, "after a failed query, B");

  const slow = who.run(A, () => sql`select pg_sleep(3)`);
  await Promise.race([slow, new Promise((r) => setTimeout(r, 300))]); // the caller gives up; the query is still running
  await seen(undefined, "after a timed-out query");
  await slow;
  await seen(undefined, "after the timed-out query finished");
  await seen(B, "after the timed-out query finished, B");

  const shared = [...pids.get(A)!].filter((p) => pids.get(B)!.has(p) || pids.get("nobody")!.has(p));
  console.log(`backends seen: A ${[...pids.get(A)!].join(",")}; B ${[...pids.get(B)!].join(",")}; nobody ${[...pids.get("nobody")!].join(",")}; shared ${shared.length}`);
  // one client connection: A, B and nobody must each have been served by the same backend, or nothing was shared
  if (!shared.length || pids.get(A)!.size !== 1 || !pids.get(B)!.has([...pids.get(A)!][0])) failures.push("A and B did not share one backend");
  if (failures.length) {
    console.error(`${failures.length} request(s) saw the wrong identity:\n${failures.slice(0, 10).join("\n")}`);
    await sql.end();
    process.exit(1);
  }
  console.log("every request saw only its own identity");

  // After the migration is deployed, the function itself must agree. Before, it is absent and this says so (not a failure).
  const [fn] = await sql<{ here: boolean }[]>`select to_regprocedure('public.current_staff()') is not null as here`;
  if (!fn.here) console.log("public.current_staff() is not on this database yet: checked again after the migration is deployed");
  else {
    const [a] = await who.run(A, () => sql<{ s: string | null }[]>`select public.current_staff()::text as s`);
    const [n] = await who.run(undefined, () => sql<{ s: string | null }[]>`select public.current_staff()::text as s`);
    if (a.s !== A || n.s !== null) {
      console.error(`public.current_staff() gave ${a.s} for A and ${n.s} for nobody`);
      await sql.end();
      process.exit(1);
    }
    console.log("public.current_staff() agrees");
  }
}
await sql.end();
