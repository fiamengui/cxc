import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadConfig } from "./config.js";

const config = loadConfig();
const productionMigration = process.argv.includes("--production");
if (productionMigration && (config.NODE_ENV !== "production" || config.DATABASE_SSL_MODE !== "verify-full" || !config.DATABASE_DIRECT_URL)) {
  throw new Error("Migration de produção exige NODE_ENV=production, SSL verify-full e DATABASE_DIRECT_URL.");
}
const pool = new pg.Pool({
  connectionString: productionMigration ? config.DATABASE_DIRECT_URL : config.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
  ssl: config.DATABASE_SSL_MODE === "verify-full" ? { rejectUnauthorized: true } : undefined,
});
const client = await pool.connect();
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

try {
  await client.query("SELECT pg_advisory_lock(hashtext('caixasimples-bratec-commercial-migrations'))");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const names = (await readdir(migrationsDirectory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
  for (const name of names) {
    const source = await readFile(join(migrationsDirectory, name), "utf8");
    const sha256 = createHash("sha256").update(source).digest("hex");
    const existing = await client.query<{sha256:string}>("SELECT sha256 FROM schema_migrations WHERE name=$1", [name]);
    if (existing.rowCount) {
      if (existing.rows[0]?.sha256 !== sha256) throw new Error(`Migration já aplicada foi alterada: ${name}`);
      continue;
    }
    const statements = source.replace(/^\s*BEGIN\s*;?/i, "").replace(/COMMIT\s*;?\s*$/i, "");
    await client.query("BEGIN");
    try {
      await client.query(statements);
      await client.query("INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)", [name, sha256]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    process.stdout.write(`Migration aplicada: ${name}\n`);
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('caixasimples-bratec-commercial-migrations'))").catch(() => undefined);
  client.release();
  await pool.end();
}
