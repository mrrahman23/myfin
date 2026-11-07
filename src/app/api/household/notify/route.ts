import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/server/admin";
import { requireUser } from "@/lib/server/auth";
import { isPushConfigured } from "@/lib/server/config";
import { sendPush } from "@/lib/server/push";
import { formatQty } from "@/lib/household/predict";
import { formatMoney, toMinor } from "@/lib/money";

const body = z.object({ type: z.enum(["request", "purchase"]), id: z.uuid() });

/**
 * Notifies the other household members right after someone adds to the
 * shopping list or records a purchase. Everything is read through the
 * caller's RLS-scoped client, so only members can trigger notifications for
 * their own household.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!isPushConfigured()) return NextResponse.json({ sent: 0, reason: "push not configured" });
  const { supabase, userId } = auth;
  const { type, id } = parsed.data;

  const table = type === "request" ? "shopping_requests" : "household_purchases";
  const { data: row } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: item }, { data: members }] = await Promise.all([
    supabase.from("household_items").select("name, name_bn, unit, emoji").eq("id", row.item_id).maybeSingle(),
    supabase.from("household_members").select("user_id, display_name").eq("household_id", row.household_id),
  ]);
  const me = members?.find((m) => m.user_id === userId);
  const others = (members ?? []).filter((m) => m.user_id !== userId).map((m) => m.user_id as string);
  if (!item || !others.length) return NextResponse.json({ sent: 0 });

  const flag = type === "request" ? "notify_household_requests" : "notify_household_purchases";
  const { data: prefs } = await getAdminSupabase().from("user_settings").select(`user_id, currency, ${flag}`).in("user_id", others);
  const recipients = (prefs ?? []).filter((p) => (p as unknown as Record<string, boolean>)[flag] !== false);
  const who = me?.display_name ?? "Someone";
  const label = `${item.emoji ? `${item.emoji} ` : ""}${item.name}${item.name_bn ? ` (${item.name_bn})` : ""}`;

  let sent = 0;
  if (type === "request") {
    const qty = row.qty ? ` — ${formatQty(row.qty, item.unit)}` : "";
    sent = await sendPush(
      recipients.map((r) => r.user_id as string),
      {
        title: `${row.urgency === "urgent" ? "🔴 Urgent: " : ""}${label}${qty}`,
        body: `${who} added this to the shopping list${row.note ? ` · ${row.note}` : ""}`,
        tag: `request-${row.id}`,
        url: "/household",
      },
    );
  } else {
    for (const r of recipients) {
      const price = row.total_price !== null ? ` · ${formatMoney(toMinor(row.total_price), { currency: (r.currency as string) ?? "BDT" })}` : "";
      sent += await sendPush([r.user_id as string], {
        title: `✅ Bought: ${label}`,
        body: `${who} bought ${formatQty(row.qty, item.unit)}${price}${row.store ? ` at ${row.store}` : ""}`,
        tag: `purchase-${row.id}`,
        url: "/household",
      });
    }
  }
  return NextResponse.json({ sent });
}
