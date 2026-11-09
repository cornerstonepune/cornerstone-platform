// The database as the migrations leave it: replay every CREATE / ALTER / DROP TABLE and CREATE / DROP VIEW in
// supabase/migrations, in file order, and return { tables: Map<name, Set<column>>, views: Set<name> }.
// Used by check.mjs to hold a wireframe's data-source to real columns. Not a SQL engine: it reads the DDL this
// repository writes (create table, add / drop / rename column, rename to, drop table, views, DO blocks). Function
// bodies are skipped. Names are kept schema-qualified only for pii ("pii.child"); public is dropped.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const norm = (n) => n.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// Remove function bodies (create function ... as $tag$ ... $tag$); keep DO block bodies, whose DDL runs.
function unwrap(sql) {
  let out = "";
  let i = 0;
  const re = /\$([A-Za-z_]*)\$/g;
  while (i < sql.length) {
    re.lastIndex = i;
    const m = re.exec(sql);
    if (!m) { out += sql.slice(i); break; }
    const before = sql.slice(i, m.index);
    const end = sql.indexOf(m[0], m.index + m[0].length);
    if (end < 0) { out += sql.slice(i); break; }
    const body = sql.slice(m.index + m[0].length, end);
    const stmtStart = before.lastIndexOf(";");
    const head = (stmtStart >= 0 ? before.slice(stmtStart) : out.slice(-400) + before).toLowerCase();
    const isDo = /\bdo\s*$/.test(head.trimEnd()) || /\bdo\s+language\s+\w+\s*$/.test(head.trimEnd());
    out += before + (isDo ? ";" + unwrap(body) + ";" : " ''");
    i = end + m[0].length;
  }
  return out;
}

function splitTop(s, sep = ",") {
  const parts = [];
  let depth = 0, cur = "", q = false;
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === sep) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const NOT_COLUMN = /^(constraint|primary|unique|foreign|check|exclude|like)\b/i;
const IDENT = String.raw`("?[A-Za-z_][\w$]*"?(?:\."?[A-Za-z_][\w$]*"?)?)`;

export function loadSchema(migrationsDir) {
  const tables = new Map();
  const views = new Set();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = unwrap(stripComments(readFileSync(join(migrationsDir, f), "utf8")));
    for (const raw of splitTop(sql, ";")) {
      let st = raw.trim().replace(/\s+/g, " ");
      if (!/^(create|alter|drop) /i.test(st)) {
        // inside a DO block: drop the begin / if ... then / else that leads to the statement
        const at = st.search(/\b(create|alter|drop) (or replace )?(unlogged )?(materialized )?(table|view) /i);
        if (at < 0) continue;
        st = st.slice(at);
      }
      let m;
      if ((m = st.match(new RegExp(String.raw`^create (?:unlogged |temp |temporary )?table (?:if not exists )?${IDENT} ?\(([\s\S]*)\)`, "i")))) {
        const name = norm(m[1]);
        if (tables.has(name) && /if not exists/i.test(st)) continue;
        const cols = new Set();
        for (const item of splitTop(m[2])) {
          const t = item.trim();
          if (!t || NOT_COLUMN.test(t)) continue;
          cols.add(norm(t.split(/\s+/)[0]));
        }
        tables.set(name, cols);
      } else if ((m = st.match(new RegExp(String.raw`^alter table (?:if exists )?(?:only )?${IDENT} (.*)$`, "i")))) {
        let name = norm(m[1]);
        for (const act of splitTop(m[2])) {
          const a = act.trim();
          let k;
          if ((k = a.match(new RegExp(String.raw`^rename to ${IDENT}`, "i")))) {
            const to = norm(k[1]);
            const cols = tables.get(name);
            tables.delete(name);
            const full = name.startsWith("pii.") && !to.includes(".") ? "pii." + to : to;
            if (cols) tables.set(full, cols);
            name = full;
          } else if ((k = a.match(new RegExp(String.raw`^rename (?:column )?${IDENT} to ${IDENT}`, "i")))) {
            const cols = tables.get(name);
            if (cols && !/^constraint$/i.test(k[1])) { cols.delete(norm(k[1])); cols.add(norm(k[2])); }
          } else if ((k = a.match(new RegExp(String.raw`^add (?:column )?(?:if not exists )?${IDENT}`, "i")))) {
            if (!/^(constraint|primary|unique|foreign|check|exclude)$/i.test(k[1])) tables.get(name)?.add(norm(k[1]));
          } else if ((k = a.match(new RegExp(String.raw`^drop (?:column )?(?:if exists )?${IDENT}`, "i")))) {
            if (!/^(constraint|default|not|identity|expression)$/i.test(k[1])) tables.get(name)?.delete(norm(k[1]));
          } else if ((k = a.match(new RegExp(String.raw`^set schema ${IDENT}`, "i")))) {
            const cols = tables.get(name);
            tables.delete(name);
            const base = name.replace(/^pii\./, "");
            const to = norm(k[1]) === "pii" ? "pii." + base : base;
            if (cols) tables.set(to, cols);
          }
        }
      } else if ((m = st.match(/^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$/i))) {
        for (const n of m[1].split(",")) tables.delete(norm(n.trim()));
      } else if ((m = st.match(new RegExp(String.raw`^create (?:or replace )?(?:materialized )?view (?:if not exists )?${IDENT}`, "i")))) {
        views.add(norm(m[1]));
      } else if ((m = st.match(/^drop (?:materialized )?view (?:if exists )?(.+?)(?: cascade| restrict)?$/i))) {
        for (const n of m[1].split(",")) views.delete(norm(n.trim()));
      }
    }
  }
  for (const v of views) if (tables.has(v)) views.delete(v);
  return { tables, views };
}
