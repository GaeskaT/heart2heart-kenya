/* Sanity-check that the generated ../setup-all.sql applies cleanly on its own. */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(readFileSync("supabase-shim.sql", "utf8"));
let sql = readFileSync("../setup-all.sql", "utf8");
sql = sql.replace(/create extension if not exists pgcrypto;/gi, "-- pgcrypto (core in PG13+)");
try {
  await db.exec(sql);
  const q = async (s) => (await db.query(s)).rows[0].c;
  console.log(`OK — setup-all.sql applies cleanly: ` +
    `${await q(`select count(*)::int c from information_schema.tables where table_schema='public'`)} tables, ` +
    `${await q(`select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)} functions, ` +
    `${await q(`select count(*)::int c from pg_policies where schemaname='public'`)} RLS policies`);
} catch (e) {
  console.log("FAILED:", String(e.message).split("\n")[0]);
  process.exit(1);
}
await db.close();
