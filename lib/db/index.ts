/**
 * Neon + Drizzle client. Only constructed when DATABASE_URL is set.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/drizzle/schema";

export type Db = NeonHttpDatabase<typeof schema>;

const g = globalThis as unknown as { __guardianDb?: Db };

function createDb(url: string): Db {
  const sql = neon(url);
  return drizzle(sql, { schema });
}

/** True when a Postgres connection string is configured. */
export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Returns the shared Drizzle client.
 * Throws if DATABASE_URL is missing — callers should check `hasDatabaseUrl()` first.
 */
export function getDb(): Db {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set; using in-memory AuthorityStore instead.");
  }
  if (!g.__guardianDb) g.__guardianDb = createDb(url);
  return g.__guardianDb;
}
