import "server-only";
import * as webpush from "web-push";
import { getAdminSupabase } from "./admin";
import { isPushConfigured, serverConfig } from "./config";

export interface PushPayload {
  title: string;
  body: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
  url?: string;
}

let configured = false;
function setup() {
  if (!configured) {
    webpush.setVapidDetails(serverConfig.vapidSubject, serverConfig.vapidPublic, serverConfig.vapidPrivate);
    configured = true;
  }
}

/**
 * Sends a Web Push notification to every registered device of the given
 * users. Expired subscriptions (404/410) are removed. Returns the number of
 * devices notified.
 */
export async function sendPush(userIds: readonly string[], payload: PushPayload): Promise<number> {
  if (!isPushConfigured() || userIds.length === 0) return 0;
  setup();
  const admin = getAdminSupabase();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_secret")
    .eq("platform", "web")
    .in("user_id", [...userIds]);
  if (error || !subs?.length) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      if (!s.p256dh || !s.auth_secret) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_secret } },
          body,
          { TTL: 60 * 60 * 12, urgency: "high" },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(s.id);
        else console.error("push failed", status, (e as Error).message);
      }
    }),
  );
  if (stale.length) await admin.from("push_subscriptions").delete().in("id", stale);
  return sent;
}
