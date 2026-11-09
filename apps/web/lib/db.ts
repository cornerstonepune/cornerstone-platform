// The only Postgres connection in the app. Server modules only: never import from a client component.
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// On a developer's machine the repo's single .env lives two levels up, and Next only reads
// apps/web/.env*. On a server there is no file — DATABASE_URL is a real environment variable.
if (!process.env.DATABASE_URL) {
  const rootEnv = path.resolve(process.cwd(), "../../.env");
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}

// Serverless runs many short-lived instances at once, so each holds a single connection and gives
// it up quickly; a long-lived server can keep a small pool. Deployed, DATABASE_URL must point at
// Supabase's *transaction* pooler (port 6543) — the session pooler keeps one server connection per
// client and a burst of functions will exhaust it. `prepare: false` is what transaction pooling
// requires, and is set either way.
const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

type Sql = ReturnType<typeof postgres>;

// Never stack a query behind another on one connection: through the transaction pooler the third
// stacked query is never answered, and the live Question bank hung for five minutes on every click
// (ADR 0024). `max_pipeline` is postgres.js's own option — its source parses it beside `max` and
// `idle_timeout` — but its type file omits it; `node scripts/check-pooler.ts` fails if it ever
// stops working. It rules out `sql.begin` (the driver registers a transaction on a path this setting
// skips, and refuses it: UNSAFE_TRANSACTION); write what must land together as one statement.
const NEVER_STACK = { max_pipeline: 0 } as Record<string, number>;

function connect(url: string): Sql {
  // Check the shape here, so a malformed value fails with a message of our own. The driver's own
  // error quotes the whole connection string, password and all, straight into the build log.
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !parsed.pathname.replace("/", "")) throw new Error("no host or database");
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid connection string. Expected " +
        "postgresql://user:password@host:6543/postgres — check for stray escaping.",
    );
  }
  if (SERVERLESS && url.includes(":5432/")) {
    console.warn(
      "DATABASE_URL uses the session pooler (5432) in a serverless runtime. Use the transaction " +
        "pooler (6543) or connections will run out under load.",
    );
  }
  return postgres(url, {
    ...NEVER_STACK,
    // The local copy the tests use (ADR 0025) runs on this machine without TLS; anything else must.
    ssl: ["127.0.0.1", "localhost"].includes(new URL(url).hostname) ? false : "require",
    prepare: false,
    // Four connections keep a page's queries side by side now that none may stack.
    max: Number(process.env.DB_POOL_MAX) || (SERVERLESS ? 4 : 3), // DB_POOL_MAX: the pooler check sets 1 to prove one connection is shared
    idle_timeout: SERVERLESS ? 5 : 20,
    connect_timeout: 10,
  });
}

// Importing this file must never need a database: `next build` loads every route to read its
// settings, and a Vercel Preview build has no DATABASE_URL. Without one, every use of `sql` — a query
// or `sql.json` — throws this instruction at the moment something asks for data, not at import.
function unset(): never {
  throw new Error(
    "DATABASE_URL is not set. Locally: copy .env.example to .env at the repo root. " +
      "On Vercel: add it in Project Settings → Environment Variables, using the transaction " +
      "pooler on port 6543.",
  );
}

declare global {
  var cornerstoneSql: Sql | undefined;
}

// One pool per process; dev's hot reload would otherwise open a new one on every edit.
const url = process.env.DATABASE_URL;
const absent = new Proxy<Sql>(unset as never, { get: () => unset });
/** The anonymous pool: it never says who is asking. For the path that works out who is asking (`staffList`), where the
 *  identity-carrying `sql` would wait on itself. Nothing else should use it. */
export const rawSql: Sql = globalThis.cornerstoneSql ?? (url ? connect(url) : absent);
if (process.env.NODE_ENV !== "production" && url) globalThis.cornerstoneSql = rawSql;

// ---- Who is asking (CP-2, ADR 0100). The signed-in person's staff id travels to Postgres with each query, as a
// transaction-local setting that `public.current_staff()` reads. This is the only place it is set, and the id comes only
// from the verified sign-in: `lib/auth.ts` registers the resolver; nothing here reads the request.
type Resolver = () => Promise<string | undefined>;
// The parts of a postgres.js query this file reaches into (its type file does not export them).
type PendingQuery = {
  handle: () => Promise<void>;
  executed: boolean;
  cursorFn?: unknown;
  onlyDescribe?: boolean;
  isRaw?: unknown;
  forEachFn?: (row: unknown) => void;
  resolve: (x: unknown) => void;
  reject: (x: unknown) => void;
  values: () => unknown;
  raw: () => unknown;
  forEach: (fn: (row: unknown) => void) => unknown;
};
declare global {
  var cornerstoneWhoIsAsking: Resolver | undefined;
}
// On globalThis, like the pool: Next may load this file once per bundle, and each copy must see the one resolver.
export function whoIsAsking(resolver: Resolver): void {
  globalThis.cornerstoneWhoIsAsking = resolver;
}

/** The setting's name, for scripts/check-pooler.ts to read it back without naming it a second time in its own text. */
export const IDENTITY_SETTING = "app.staff_id";

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function identity(): Promise<string | undefined> {
  try {
    const id = await globalThis.cornerstoneWhoIsAsking?.();
    return id && UUID.test(id) ? id : undefined; // the dev bypass has no id; never the text "undefined"
  } catch {
    return undefined; // outside a request (a script, a build) there is nobody asking
  }
}

// One connection is held for the whole of the request's query, and nothing is stacked on it: BEGIN, the setting, the
// query, COMMIT, each awaited before the next. Under transaction pooling BEGIN pins one backend until COMMIT, so the
// setting cannot reach another request's query, and `true` (transaction-local) means it cannot outlive this one.
async function asking<T>(staff: string, run: (tx: Sql) => Promise<T>): Promise<T> {
  const tx = await rawSql.reserve();
  try {
    await tx`begin`;
    try {
      await tx`select set_config('app.staff_id', ${staff}, true)`;
      const out = await run(tx as unknown as Sql);
      await tx`commit`;
      return out;
    } catch (e) {
      await tx`rollback`.catch(() => {});
      throw e;
    }
  } finally {
    tx.release();
  }
}

/** The pool every page, route and action reads and writes through. With a signed-in person each query runs carrying
 *  their id; with nobody it is the plain pool. Same tagged-template shape as postgres.js, so call sites do not change. */
export const sql: Sql = new Proxy(rawSql, {
  apply(target, _this, args: unknown[]) {
    const strings = args[0] as { raw?: unknown } | undefined;
    // a helper (`sql("column")`), not a query
    if (!Array.isArray(strings?.raw)) return Reflect.apply(target, _this, args);
    // Built on the pool so it is still a postgres.js query, which is what lets it sit inside another query as a
    // fragment. `handle` is the one door postgres.js runs a query through (then, catch, finally, execute and forEach all
    // call it), so it is replaced here: the query runs once, on a connection that carries the identity.
    const query = Reflect.apply(target, _this, args) as PendingQuery;
    // Asked now, in the context that built the query, not when it is awaited: that is the context that knows the person.
    const asked = identity();
    const plain = query.handle;
    query.handle = async function (this: PendingQuery) {
      if (this.executed) return;
      this.executed = true; // before the first await: catch() and then() each call handle(), and the query must run once
      const staff = await asked;
      if (!staff) {
        this.executed = false;
        return plain.call(this); // nobody asking: the plain pool, as before
      }
      if (this.cursorFn || this.onlyDescribe) return this.reject(new Error("cursor() and describe() are not available on a query made for a signed-in person"));
      const done = asking(staff, (tx) => {
        const q = (tx as unknown as (...a: unknown[]) => PendingQuery)(...args);
        if (this.isRaw === "values") q.values();
        else if (this.isRaw) q.raw();
        if (this.forEachFn) q.forEach(this.forEachFn);
        return q as unknown as Promise<unknown>;
      });
      done.then(this.resolve, this.reject);
    };
    return query;
  },
});

// The school these rows belong to, as the engine names it (`db.tenant_slug()`): the website writes a few rows of its own.
export const TENANT_SLUG = process.env.TENANT_SLUG ?? "cornerstone-pune";
