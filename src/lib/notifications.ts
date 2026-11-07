"use client";

import { useEffect } from "react";
import { useOpenItems, useSettings, useToday, useCurrency } from "./data/hooks";
import { formatMoney } from "./money";

/**
 * Platform-neutral notification interface. The web implementation uses the
 * Notification API through the service worker; a Capacitor build can provide
 * a native implementation (APNs via @capacitor/push-notifications or local
 * notifications) with the same shape.
 */
export interface NotificationService {
  isSupported(): boolean;
  permission(): NotificationPermission | "unsupported";
  requestPermission(): Promise<NotificationPermission | "unsupported">;
  notify(input: { title: string; body: string; tag: string; url?: string }): Promise<void>;
}

export const webNotifications: NotificationService = {
  isSupported: () => typeof window !== "undefined" && "Notification" in window,
  permission: () => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"),
  async requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    return Notification.requestPermission();
  },
  async notify({ title, body, tag, url = "/reminders" }) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const options: NotificationOptions = { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url } };
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  },
};

/** True when running as an installed (home-screen) app. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const SENT_KEY = "myfin-reminders-sent";

/**
 * When the app is opened, sends at most one reminder per item per day for
 * items due within the reminder window and (optionally) overdue ones.
 */
export function useReminderNotifications(service: NotificationService = webNotifications) {
  const { data: settings } = useSettings();
  const { items } = useOpenItems();
  const today = useToday();
  const currency = useCurrency();

  useEffect(() => {
    if (!settings?.notifications_enabled || !items || service.permission() !== "granted") return;
    let sent: Record<string, string> = {};
    try {
      sent = JSON.parse(localStorage.getItem(SENT_KEY) || "{}");
    } catch {
      sent = {};
    }
    const window = settings.reminder_days_before;
    const due = items.filter(
      (i) =>
        i.kind === "expense" &&
        i.daysUntilDue !== null &&
        ((i.daysUntilDue >= 0 && i.daysUntilDue <= window) || (settings.notify_overdue && i.daysUntilDue < 0)) &&
        sent[i.id] !== today,
    );
    if (!due.length) return;
    const overdue = due.filter((i) => i.overdue);
    const upcoming = due.filter((i) => !i.overdue);
    const run = async () => {
      if (overdue.length) {
        const total = overdue.reduce((s, i) => s + i.totalDue, 0);
        await service.notify({
          title: overdue.length === 1 ? `${overdue[0].name} is overdue` : `${overdue.length} payments overdue`,
          body: `${formatMoney(total, { currency })} outstanding${overdue.length > 1 ? ` · ${overdue.map((i) => i.name).slice(0, 3).join(", ")}` : ""}`,
          tag: `overdue-${today}`,
        });
      }
      if (upcoming.length) {
        const total = upcoming.reduce((s, i) => s + i.totalDue, 0);
        await service.notify({
          title: upcoming.length === 1 ? `${upcoming[0].name} due soon` : `${upcoming.length} payments due soon`,
          body: `${formatMoney(total, { currency })} due in the next ${window} day${window === 1 ? "" : "s"}`,
          tag: `upcoming-${today}`,
        });
      }
      for (const i of due) sent[i.id] = today;
      try {
        localStorage.setItem(SENT_KEY, JSON.stringify(sent));
      } catch {
        /* storage unavailable */
      }
    };
    void run();
  }, [settings, items, today, currency, service]);
}
