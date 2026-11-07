import { NextResponse, type NextRequest } from "next/server";
import { addDays, formatDate, periodOf, todayISO } from "@/lib/dates";
import { formatQty, predictItem } from "@/lib/household/predict";
import { formatMoney, toMinor } from "@/lib/money";
import { getAdminSupabase } from "@/lib/server/admin";
import { isPushConfigured, serverConfig } from "@/lib/server/config";
import { sendPush } from "@/lib/server/push";

/**
 * Daily job (Vercel Cron, see vercel.json):
 *  1. opens the current month for each user (generates recurring bills),
 *  2. sends payment reminders for bills due within the user's reminder window
 *     (and overdue ones),
 *  3. warns each household about items predicted to run out soon.
 */
export async function GET(req: NextRequest) {
  if (!serverConfig.cronSecret || req.headers.get("authorization") !== `Bearer ${serverConfig.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) return NextResponse.json({ skipped: "push not configured" });
  const admin = getAdminSupabase();
  const report = { finance: 0, household: 0, errors: [] as string[] };

  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  if (!userIds.length) return NextResponse.json(report);
  const { data: settings } = await admin.from("user_settings").select("*").in("user_id", userIds);

  // 1–2. payment reminders
  for (const s of settings ?? []) {
    if (!s.finance_enabled || !s.notifications_enabled) continue;
    try {
      const today = todayISO(s.timezone);
      await admin.rpc("ensure_month_for", { p_user: s.user_id, p_period: periodOf(today) });
      const { data: due } = await admin
        .from("obligation_status")
        .select("name, due_date, outstanding, carried_in")
        .eq("user_id", s.user_id)
        .eq("kind", "expense")
        .gt("outstanding", 0)
        .not("due_date", "is", null)
        .lte("due_date", addDays(today, s.reminder_days_before))
        .order("due_date");
      const items = (due ?? []).filter((d) => s.notify_overdue || d.due_date >= today);
      if (!items.length) continue;
      const total = items.reduce((sum, d) => sum + toMinor(d.outstanding), 0);
      const overdue = items.filter((d) => d.due_date < today);
      const dueToday = items.filter((d) => d.due_date === today);
      const money = (m: number) => formatMoney(m, { currency: s.currency });
      const year = +today.slice(0, 4);
      const title =
        items.length === 1
          ? `${items[0].name} ${items[0].due_date < today ? "is overdue" : items[0].due_date === today ? "is due today" : `due ${formatDate(items[0].due_date, year)}`}`
          : overdue.length
            ? `${overdue.length} overdue · ${items.length} payments pending`
            : dueToday.length
              ? `${dueToday.length} due today · ${items.length} payments coming up`
              : `${items.length} payments due soon`;
      const body =
        `${money(total)} · ` +
        items
          .slice(0, 4)
          .map((d) => `${d.name} (${d.due_date === today ? "today" : formatDate(d.due_date, year)})`)
          .join(", ") +
        (items.length > 4 ? ` +${items.length - 4} more` : "");
      report.finance += await sendPush([s.user_id], { title, body, tag: `due-${today}`, url: "/reminders" });
    } catch (e) {
      report.errors.push(`finance ${s.user_id}: ${(e as Error).message}`);
    }
  }

  // 3. household run-out predictions
  const { data: memberships } = await admin.from("household_members").select("household_id, user_id").in("user_id", userIds);
  const byHousehold = new Map<string, string[]>();
  for (const m of memberships ?? []) {
    const pref = settings?.find((s) => s.user_id === m.user_id);
    if (pref && pref.notify_household_predictions === false) continue;
    byHousehold.set(m.household_id, [...(byHousehold.get(m.household_id) ?? []), m.user_id]);
  }
  for (const [householdId, members] of byHousehold) {
    try {
      const tz = settings?.find((s) => s.user_id === members[0])?.timezone ?? "Asia/Dhaka";
      const today = todayISO(tz);
      const since = addDays(today, -400);
      const [{ data: items }, { data: purchases }, { data: requests }] = await Promise.all([
        admin.from("household_items").select("id, name, unit").eq("household_id", householdId).eq("is_archived", false),
        admin.from("household_purchases").select("item_id, qty, total_price, purchased_on").eq("household_id", householdId).gte("purchased_on", since),
        admin.from("shopping_requests").select("item_id, status, requested_at").eq("household_id", householdId).gte("requested_at", since),
      ]);
      const soon = (items ?? [])
        .filter((it) => !(requests ?? []).some((r) => r.item_id === it.id && r.status === "open"))
        .map((it) => ({
          it,
          p: predictItem(
            (purchases ?? []).filter((x) => x.item_id === it.id).map((x) => ({ date: x.purchased_on, qty: Number(x.qty), totalPrice: x.total_price === null ? null : toMinor(x.total_price) })),
            (requests ?? []).filter((r) => r.item_id === it.id).map((r) => r.requested_at),
            today,
            2,
          ),
        }))
        .filter(({ p }) => p.status === "soon" || p.status === "out")
        .sort((a, b) => (a.p.daysLeft ?? 0) - (b.p.daysLeft ?? 0));
      if (!soon.length) continue;
      const list = soon
        .slice(0, 5)
        .map(({ it, p }) => `${it.name}${p.suggestedQty ? ` (${formatQty(p.suggestedQty, it.unit)})` : ""}${(p.daysLeft ?? 0) <= 0 ? " — likely out" : ` — ~${p.daysLeft}d`}`)
        .join(", ");
      report.household += await sendPush(members, {
        title: soon.length === 1 ? `${soon[0].it.name} is running out` : `${soon.length} household items running out`,
        body: `${list}. Tap to add them to the shopping list.`,
        tag: `pantry-${today}`,
        url: "/household?tab=list",
      });
    } catch (e) {
      report.errors.push(`household ${householdId}: ${(e as Error).message}`);
    }
  }
  return NextResponse.json(report);
}
