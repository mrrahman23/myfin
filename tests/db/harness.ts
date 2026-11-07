import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Boots an in-process PostgreSQL (PGlite) with a minimal stand-in for the
 * Supabase `auth` schema and roles, then applies every migration in order.
 */
export async function createTestDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant usage on schema public to authenticated, anon;
  `);
  const dir = join(__dirname, "../../supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/** Creates an auth user (fires the seed trigger) and returns its id. */
export async function createUser(db: TestDb, id: string, fullName = "Test User", meta: Record<string, unknown> = {}) {
  await db.query(`reset role`);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    `${id.slice(0, 8)}@example.com`,
    JSON.stringify({ full_name: fullName, ...meta }),
  ]);
  return id;
}

/** Run queries as the server (service_role bypasses RLS). */
export async function asService<T>(db: TestDb, fn: () => Promise<T>): Promise<T> {
  await db.query(`set role service_role`);
  try {
    return await fn();
  } finally {
    await db.query(`reset role`);
  }
}

/** Run queries as a signed-in user through RLS (role `authenticated`). */
export async function as<T>(db: TestDb, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: userId })]);
  try {
    return await fn();
  } finally {
    await db.query(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export const num = (v: unknown) => Number(v);
