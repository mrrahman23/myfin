import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/server/admin";
import { requireUser } from "@/lib/server/auth";
import { serverConfig } from "@/lib/server/config";

const body = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(72),
});

/**
 * Household owner adds a family member. Creates a household-only account
 * (no finance data, no email confirmation needed) with the given password,
 * or adds the person if they already have an account.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!serverConfig.secretKey) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SECRET_KEY — see README." }, { status: 503 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a name, a valid email and a password of at least 8 characters." }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const { data: me } = await auth.supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (!me || me.role !== "owner") {
    return NextResponse.json({ error: "Only the household owner can add members." }, { status: 403 });
  }

  const admin = getAdminSupabase();
  let userId: string | null = null;
  let created = false;
  const res = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, household_only: true },
  });
  if (res.data.user) {
    userId = res.data.user.id;
    created = true;
  } else if (res.error && /already|exists|registered/i.test(res.error.message)) {
    const { data } = await admin.rpc("find_user_id_by_email", { p_email: email });
    userId = (data as string | null) ?? null;
  } else if (res.error) {
    return NextResponse.json({ error: res.error.message }, { status: 400 });
  }
  if (!userId) return NextResponse.json({ error: "Could not create the account." }, { status: 400 });
  if (userId === auth.userId) return NextResponse.json({ error: "You're already in this household." }, { status: 400 });

  const { error } = await admin.rpc("household_add_member", {
    p_household: me.household_id,
    p_user: userId,
    p_display_name: name,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ created });
}
