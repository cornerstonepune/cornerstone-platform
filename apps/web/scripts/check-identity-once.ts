// A query that carries an identity runs exactly once, however it is awaited (then, catch, finally, execute), and keeps
// .values(). Needs a database it may write a temporary table to, never the live one:
//   cd apps/web && TEST_DATABASE_URL=postgresql://... node scripts/check-identity-once.ts
import { AsyncLocalStorage } from "node:async_hooks";

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is not set: this check writes a temporary table, so it never uses DATABASE_URL.");
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DB_POOL_MAX = "1"; // one connection, so the temporary table is seen by every query
const { sql, rawSql, whoIsAsking, IDENTITY_SETTING } = await import("../lib/db.ts");

const A = "11111111-1111-4111-8111-111111111111";
const who = new AsyncLocalStorage<string | undefined>();
whoIsAsking(async () => who.getStore());

await rawSql`create temp table hits (n int)`;
await who.run(A, async () => {
  await sql`insert into hits values (1)`;
  await sql`insert into hits values (2)`.catch(() => {});
  await sql`insert into hits values (3)`.finally(() => {});
  await sql`insert into hits values (4)`.execute();
});
await who.run(undefined, () => sql`insert into hits values (5)`.catch(() => {}));
const [{ c }] = await rawSql<{ c: number }[]>`select count(*)::int as c from hits`;
const [row] = await who.run(A, () => sql<{ s: string }[]>`select current_setting(${IDENTITY_SETTING}, true) as s`);
const values = await who.run(A, () => sql`select 1 as a`.values());
await rawSql.end();

const problems = [
  c !== 5 && `5 inserts ran ${c} times`,
  row.s !== A && "the identity did not reach the query",
  JSON.stringify(values) !== "[[1]]" && ".values() was lost",
].filter(Boolean);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("each query ran once, carried the identity, and kept .values()");
