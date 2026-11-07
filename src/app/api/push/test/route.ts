import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { isPushConfigured } from "@/lib/server/config";
import { sendPush } from "@/lib/server/push";

/** Sends a test notification to the caller's own devices. */
export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push is not configured on the server (VAPID keys / SUPABASE_SECRET_KEY)." }, { status: 503 });
  }
  const sent = await sendPush([auth.userId], {
    title: "myFin notifications are on",
    body: "You'll get payment reminders and household updates here.",
    tag: "test",
    url: "/settings/notifications",
  });
  return NextResponse.json({ sent });
}
