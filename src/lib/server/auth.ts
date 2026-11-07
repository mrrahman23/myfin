import "server-only";
import { NextResponse } from "next/server";
import { getServerSupabase } from "../supabase/server";

/** Resolves the signed-in user from the request cookies (RLS-scoped client). */
export async function requireUser() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  return { supabase, userId } as const;
}
