import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../env";
import { serverConfig } from "./config";

let admin: SupabaseClient | undefined;

/**
 * Service-role client. Bypasses RLS — use only in route handlers after the
 * caller has been authorised, and never expose it to the browser.
 */
export function getAdminSupabase(): SupabaseClient {
  if (!serverConfig.secretKey) throw new Error("SUPABASE_SECRET_KEY is not configured");
  if (!admin) {
    admin = createClient(SUPABASE_URL, serverConfig.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
