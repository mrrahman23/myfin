// Local stand-in for Supabase, for UI development and end-to-end tests
// without Docker or a cloud project.
//
//   node scripts/mock-supabase.mjs            # listens on :54321
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=mock npm run dev
//
// It runs the real migration in PGlite (PostgreSQL compiled to WASM), so all
// triggers, RPCs and row-level-security policies are the production ones.
// Only the HTTP layer is emulated: a subset of GoTrue (password auth) and of
// PostgREST (the query features this app uses). Data lives in memory.
// Any email/password signs in; the account is created on first use.
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 54321);
// Use this as SUPABASE_SECRET_KEY to act as service_role (bypasses RLS).
const SERVICE_KEY = process.env.MOCK_SERVICE_KEY ?? "mock-secret";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const raw = (v) => v;
const db = new PGlite({ parsers: { 1082: raw, 1114: raw, 1184: raw } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
  grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
  grant usage on schema public to authenticated, anon;
`);
const migrations = join(root, "supabase/migrations");
for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrations, f), "utf8"));
}
await db.exec(`grant all on all tables in schema public to service_role;
  grant execute on all functions in schema public to service_role;`);
console.log("mock-supabase: migrations applied");

// --------------------------------------------------------------------------- auth
const users = new Map(); // email -> user
const b64url = (s) => Buffer.from(s).toString("base64url");
function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const token = [
    b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 86400 })),
    b64url("mock-signature"),
  ].join(".");
  return { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: `r-${user.id}`, user };
}
async function ensureUser(email, fullName, meta = {}) {
  if (users.has(email)) return users.get(email);
  const id = randomUUID();
  const metadata = { full_name: fullName ?? "", ...meta };
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify(metadata)]);
  const user = { id, aud: "authenticated", role: "authenticated", email, user_metadata: metadata, app_metadata: { provider: "email" }, created_at: new Date().toISOString() };
  users.set(email, user);
  return user;
}
const isService = (req) => (req.headers.authorization ?? "").replace(/^Bearer /i, "") === SERVICE_KEY;
function userFromAuth(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /i, "");
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return [...users.values()].find((u) => u.id === payload.sub) ?? null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------- postgrest
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400 });
  return `"${s}"`;
};
const OPS = { eq: "=", neq: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=", like: "like", ilike: "ilike" };

function condition(col, expr, params) {
  let negate = false;
  if (expr.startsWith("not.")) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const val = expr.slice(dot + 1);
  let sql;
  if (op === "is") sql = `${ident(col)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
  else if (op === "in") {
    const items = val.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
    sql = `${ident(col)} in (${items.map((v) => (params.push(v), `$${params.length}`)).join(",")})`;
  } else if (OPS[op]) {
    params.push(op.endsWith("like") ? val.replace(/\*/g, "%") : val);
    sql = `${ident(col)} ${OPS[op]} $${params.length}`;
  } else throw Object.assign(new Error(`unsupported operator ${op}`), { status: 400 });
  return negate ? `not (${sql})` : sql;
}

function whereClause(url, params) {
  const parts = [];
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    if (key === "or") {
      const inner = value.replace(/^\(|\)$/g, "").split(/,(?![^(]*\))/);
      parts.push(`(${inner.map((c) => { const i = c.indexOf("."); return condition(c.slice(0, i), c.slice(i + 1), params); }).join(" or ")})`);
    } else parts.push(condition(key, value, params));
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

function selectList(url) {
  const s = (url.searchParams.get("select") ?? "*").replace(/\s/g, "");
  return s === "*" ? "*" : s.split(",").map(ident).join(", ");
}

async function rest(req, url, body, user) {
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const role = isService(req) ? "service_role" : user ? "authenticated" : "anon";
  const claims = JSON.stringify({ sub: user?.id ?? "", role });
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    const params = [];
    if (path.startsWith("rpc/")) {
      const fn = ident(path.slice(4));
      const args = Object.entries(body ?? {}).map(([k, v]) => {
        params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        return `${ident(k)} => $${params.length}`;
      });
      const r = await tx.query(`select public.${fn}(${args.join(", ")}) as r`, params);
      return { status: 200, json: r.rows[0]?.r ?? null };
    }
    const table = `public.${ident(path)}`;
    const prefer = req.headers.prefer ?? "";
    const returning = prefer.includes("return=representation") ? ` returning ${selectList(url)}` : "";
    let sql;
    if (req.method === "GET" || req.method === "HEAD") {
      sql = `select ${selectList(url)} from ${table}${whereClause(url, params)}`;
      const order = url.searchParams.get("order");
      if (order) {
        sql += " order by " + order.split(",").map((o) => {
          const [c, dir, nulls] = o.split(".");
          return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
        }).join(", ");
      }
      if (url.searchParams.get("limit")) sql += ` limit ${Number(url.searchParams.get("limit"))}`;
      if (url.searchParams.get("offset")) sql += ` offset ${Number(url.searchParams.get("offset"))}`;
    } else if (req.method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const cols = [...new Set(rows.flatMap(Object.keys))];
      const values = rows.map((r) => `(${cols.map((c) => {
        if (!(c in r)) return "default";
        const v = r[c];
        params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        return `$${params.length}`;
      }).join(", ")})`);
      sql = `insert into ${table} (${cols.map(ident).join(", ")}) values ${values.join(", ")}`;
      if (prefer.includes("resolution=merge-duplicates")) {
        const conflict = (url.searchParams.get("on_conflict") ?? "id").split(",").map(ident);
        const updates = cols.filter((c) => !conflict.includes(`"${c}"`)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
        sql += ` on conflict (${conflict.join(", ")}) ${updates.length ? `do update set ${updates.join(", ")}` : "do nothing"}`;
      }
      sql += returning;
    } else if (req.method === "PATCH") {
      const sets = Object.entries(body).map(([k, v]) => {
        params.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v);
        return `${ident(k)} = $${params.length}`;
      });
      sql = `update ${table} set ${sets.join(", ")}${whereClause(url, params)}${returning}`;
    } else if (req.method === "DELETE") {
      sql = `delete from ${table}${whereClause(url, params)}${returning}`;
    } else throw Object.assign(new Error("method not allowed"), { status: 405 });

    const r = await tx.query(sql, params);
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (req.method !== "GET" && !returning) return { status: req.method === "POST" ? 201 : 204, json: undefined };
    if (wantsObject) {
      if (r.rows.length !== 1) {
        return { status: 406, json: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `Results contain ${r.rows.length} rows`, hint: null } };
      }
      return { status: 200, json: r.rows[0] };
    }
    return { status: req.method === "POST" ? 201 : 200, json: r.rows };
  });
}

// --------------------------------------------------------------------------- http
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,prefer,accept,range,x-client-info,accept-profile,content-profile,x-supabase-api-version",
  "Access-Control-Expose-Headers": "content-range,x-supabase-api-version",
};
function send(res, status, json) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(json === undefined ? "" : JSON.stringify(json));
}

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let body = null;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString();
    body = text ? JSON.parse(text) : null;
  } catch {
    return send(res, 400, { message: "invalid JSON" });
  }
  try {
    if (url.pathname === "/auth/v1/token" || url.pathname === "/auth/v1/signup") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "refresh_token") {
        const id = String(body?.refresh_token ?? "").replace(/^r-/, "");
        const user = [...users.values()].find((u) => u.id === id);
        return user ? send(res, 200, makeSession(user)) : send(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
      }
      if (!body?.email || !body?.password) return send(res, 400, { error: "invalid_grant", error_description: "Missing credentials" });
      const user = await ensureUser(String(body.email).toLowerCase(), body?.data?.full_name ?? body?.options?.data?.full_name);
      return send(res, 200, makeSession(user));
    }
    if (url.pathname === "/auth/v1/user") {
      const user = userFromAuth(req);
      if (!user) return send(res, 401, { code: 401, message: "invalid JWT" });
      return send(res, 200, user);
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
      if (!isService(req)) return send(res, 401, { msg: "service role required" });
      const email = String(body?.email ?? "").toLowerCase();
      if (users.has(email)) return send(res, 422, { code: "email_exists", msg: "A user with this email address has already been registered" });
      const user = await ensureUser(email, body?.user_metadata?.full_name, body?.user_metadata ?? {});
      return send(res, 200, user);
    }
    if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, {});
    if (url.pathname.startsWith("/rest/v1/")) {
      const { status, json } = await rest(req, url, body, userFromAuth(req));
      return send(res, status, json);
    }
    send(res, 404, { message: "not found" });
  } catch (e) {
    const status = e.status ?? (e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400);
    send(res, status, { code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
}).listen(PORT, () => console.log(`mock-supabase: http://localhost:${PORT}`));
