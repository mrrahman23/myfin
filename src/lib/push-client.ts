"use client";

import { getSupabase } from "./supabase/client";
import { savePushSubscription, updateSettings } from "./data/mutations";
import { unwrap } from "./data/errors";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** True when the server is set up for Web Push (keys present at build time). */
export const pushConfigured = Boolean(VAPID_PUBLIC_KEY);

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks permission, subscribes this device and stores it for the server. */
export async function enablePush(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  await savePushSubscription({ platform: "web", endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth_secret: json.keys?.auth });
  await updateSettings({ notifications_enabled: true });
  return permission;
}

/** Unsubscribes this device. Other devices keep receiving notifications. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    unwrap(await getSupabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint));
    await sub.unsubscribe().catch(() => {});
  }
  const { data } = await getSupabase().from("push_subscriptions").select("id").limit(1);
  if (!data?.length) await updateSettings({ notifications_enabled: false });
}

export async function sendTestPush(): Promise<number> {
  const res = await fetch("/api/push/test", { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Could not send a test notification");
  return json.sent ?? 0;
}

/** Fire-and-forget: tell household members about a change. */
export function notifyHousehold(type: "request" | "purchase", id: string) {
  if (!pushConfigured) return;
  void fetch("/api/household/notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, id }),
    keepalive: true,
  }).catch(() => {});
}
