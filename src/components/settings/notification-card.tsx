"use client";

import { BellOff, BellRing, Send, Share } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/errors";
import { useSettings } from "@/lib/data/hooks";
import { refreshAll, updateSettings } from "@/lib/data/mutations";
import { isStandalone, webNotifications } from "@/lib/notifications";
import { currentSubscription, disablePush, enablePush, pushConfigured, pushSupported, sendTestPush } from "@/lib/push-client";

/**
 * Turns notifications on for this device. With server push configured, the
 * device is subscribed for Web Push (works while the app is closed);
 * otherwise reminders are shown when the app is opened.
 */
export function NotificationCard({ compact = false }: { compact?: boolean }) {
  const toast = useToast();
  const { data: settings } = useSettings();
  // Rendered only inside the client-side signed-in shell, so browser APIs are available.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => webNotifications.permission());
  const [standalone] = useState(() => isStandalone());
  const [ios] = useState(
    () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const usePush = pushConfigured && pushSupported();

  useEffect(() => {
    let alive = true;
    if (usePush) void currentSubscription().then((s) => alive && setSubscribed(Boolean(s)));
    return () => {
      alive = false;
    };
  }, [usePush]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const enable = () =>
    run("enable", async () => {
      if (usePush) {
        const result = await enablePush();
        setPermission(result);
        if (result !== "granted") {
          if (result === "denied") toast.error("Notifications are blocked. Allow them in Settings → Notifications → myFin.");
          return;
        }
        setSubscribed(true);
        await refreshAll();
        const sent = await sendTestPush().catch(() => 0);
        toast.success(sent ? "Notifications on — check for a test notification" : "Notifications on for this device");
      } else {
        const result = await webNotifications.requestPermission();
        setPermission(result);
        if (result !== "granted") return;
        await updateSettings({ notifications_enabled: true });
        await refreshAll();
        toast.success("Reminders on (shown when you open myFin)");
      }
    });

  const disable = () =>
    run("disable", async () => {
      if (usePush) {
        await disablePush();
        setSubscribed(false);
      } else {
        await updateSettings({ notifications_enabled: false });
      }
      await refreshAll();
      toast.show("Notifications turned off on this device");
    });

  const enabled = usePush ? Boolean(subscribed) && permission === "granted" : Boolean(settings?.notifications_enabled) && permission === "granted";
  const needsInstall = ios && !standalone;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${enabled ? "bg-positive-soft text-positive" : "bg-surface-3 text-ink-2"}`}>
          {enabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">Notifications</h2>
          <p className="text-[12.5px] text-ink-3">{enabled ? "On for this device" : "Off on this device"}</p>
        </div>
      </div>
      {permission === "unsupported" || needsInstall ? (
        <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-[13px] leading-relaxed text-ink-2">
          {ios ? (
            <>
              On iPhone, notifications work once myFin is on your Home Screen. Tap <Share className="inline h-4 w-4 align-[-3px]" /> Share →{" "}
              <b>Add to Home Screen</b>, then open myFin from there and come back here.
            </>
          ) : (
            "This browser does not support notifications."
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {!compact ? (
            <p className="text-[13px] leading-relaxed text-ink-2">
              {usePush
                ? "Get payment reminders every morning (before and on the due date), instant alerts when someone adds to the shopping list, and a heads-up when groceries are about to run out — even when the app is closed."
                : "Reminders appear when you open myFin (at most once a day). Instant push needs server setup — see README."}
            </p>
          ) : null}
          {enabled ? (
            <div className="grid grid-cols-2 gap-2">
              {usePush ? (
                <Button
                  variant="tinted"
                  loading={busy === "test"}
                  onClick={() =>
                    run("test", async () => {
                      const n = await sendTestPush();
                      toast.success(n ? "Test notification sent" : "No devices registered yet");
                    })
                  }
                >
                  <Send className="h-4 w-4" /> Test
                </Button>
              ) : (
                <span />
              )}
              <Button variant="secondary" onClick={disable} loading={busy === "disable"}>
                Turn off
              </Button>
            </div>
          ) : (
            <Button className="w-full" onClick={enable} loading={busy === "enable"} disabled={permission === "denied"}>
              {permission === "denied" ? "Blocked — allow in iOS Settings" : "Turn on notifications"}
            </Button>
          )}
          {!compact ? (
            <Link href="/settings/notifications" className="block text-center text-[13px] font-semibold text-accent">
              Notification preferences
            </Link>
          ) : null}
        </div>
      )}
    </Card>
  );
}
