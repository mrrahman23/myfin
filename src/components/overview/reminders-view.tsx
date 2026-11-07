"use client";

import { BellOff, BellRing, CheckCircle2, Share } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ItemRow } from "@/components/budget/item-row";
import { ItemSheet } from "@/components/budget/item-sheet";
import { usePayToggle } from "@/components/budget/use-pay-toggle";
import { PageHeader } from "@/components/shell/app-shell";
import { Money } from "@/components/ui/money";
import { Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ConfirmSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/errors";
import { useOpenItems, useSettings, useToday } from "@/lib/data/hooks";
import { refreshAll, updateSettings } from "@/lib/data/mutations";
import type { LineItem } from "@/lib/finance/summary";
import { isStandalone, webNotifications } from "@/lib/notifications";

export function RemindersView() {
  const today = useToday();
  const { items, isLoading } = useOpenItems();
  const { data: settings } = useSettings();
  const pay = usePayToggle();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const days = settings?.reminder_days_before ?? 3;

  const all = items ?? [];
  const overdue = all.filter((i) => i.overdue);
  const soon = all.filter((i) => !i.overdue && i.daysUntilDue !== null && i.daysUntilDue <= days);
  const later = all.filter((i) => !i.overdue && (i.daysUntilDue === null || i.daysUntilDue > days));

  const section = (title: string, list: LineItem[], tone?: string) =>
    list.length ? (
      <section>
        <div className="mb-1.5 flex items-center justify-between px-1 text-[13px] font-semibold">
          <span className={tone}>{title}</span>
          <Money value={list.filter((i) => i.kind === "expense").reduce((s, i) => s + i.totalDue, 0)} className="text-ink-3" />
        </div>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {list.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                state={pay.stateOf(item)}
                busy={pay.busyId === item.id}
                today={today}
                showPeriod
                onToggle={() => pay.toggle(item)}
                onOpen={() => setSelectedId(item.id)}
              />
            ))}
          </ul>
        </Card>
      </section>
    ) : null;

  return (
    <>
      <PageHeader title="Reminders" subtitle="Upcoming & overdue" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {isLoading && !items ? (
            <Skeleton className="h-64" />
          ) : all.length === 0 ? (
            <Card>
              <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Nothing outstanding" body="Every item in every month is settled." />
            </Card>
          ) : (
            <>
              {section("Overdue", overdue, "text-negative")}
              {section(`Due in the next ${days} day${days === 1 ? "" : "s"}`, soon, "text-ink")}
              {section("Later", later, "text-ink-3")}
            </>
          )}
        </div>
        <aside>
          <NotificationCard />
        </aside>
      </div>
      <ItemSheet item={items?.find((i) => i.id === selectedId) ?? null} onClose={() => setSelectedId(null)} />
      <ConfirmSheet
        open={Boolean(pay.confirmUnpay)}
        onClose={() => pay.setConfirmUnpay(null)}
        onConfirm={() => pay.confirmUnpay && pay.unpay(pay.confirmUnpay)}
        destructive
        confirmLabel="Mark unpaid"
        title={`Undo ${pay.confirmUnpay?.name ?? ""}?`}
        body="This removes the payments recorded on this item."
      />
    </>
  );
}

export function NotificationCard() {
  const toast = useToast();
  const { data: settings } = useSettings();
  // Rendered only on the client (inside the signed-in shell), so browser APIs are available.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => webNotifications.permission());
  const [standalone] = useState(() => isStandalone());
  const [ios] = useState(
    () =>
      typeof navigator !== "undefined" &&
      (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
  );
  const [busy, setBusy] = useState(false);

  async function enable() {
    setBusy(true);
    try {
      const result = await webNotifications.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await updateSettings({ notifications_enabled: true });
        await refreshAll();
        await webNotifications.notify({ title: "Reminders are on", body: "We'll remind you about upcoming and overdue payments.", tag: "welcome" });
        toast.success("Payment reminders enabled");
      } else if (result === "denied") {
        toast.error("Notifications are blocked. Allow them in your browser or iOS settings.");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await updateSettings({ notifications_enabled: false });
      await refreshAll();
      toast.show("Reminders turned off");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const enabled = Boolean(settings?.notifications_enabled) && permission === "granted";

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${enabled ? "bg-positive-soft text-positive" : "bg-surface-3 text-ink-2"}`}>
          {enabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
        <div>
          <h2 className="text-[15px] font-semibold">Payment reminders</h2>
          <p className="text-[12.5px] text-ink-3">{enabled ? `On · ${settings?.reminder_days_before} days before due` : "Off"}</p>
        </div>
      </div>
      {permission === "unsupported" || (ios && !standalone) ? (
        <div className="mt-4 rounded-2xl bg-surface-2 p-4 text-[13px] leading-relaxed text-ink-2">
          {ios ? (
            <>
              On iPhone and iPad, notifications work once myFin is on your Home Screen. Tap <Share className="inline h-4 w-4 align-[-3px]" /> Share
              → <b>Add to Home Screen</b>, then open myFin from there.
            </>
          ) : (
            "This browser does not support notifications. Reminders still show here and on the overview."
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-[13px] text-ink-2">
            When you open myFin, you&apos;ll get one notification for payments due soon and one for anything overdue (at most once a day).
          </p>
          {enabled ? (
            <Button variant="secondary" className="w-full" onClick={disable} loading={busy}>
              Turn off
            </Button>
          ) : (
            <Button className="w-full" onClick={enable} loading={busy} disabled={permission === "denied"}>
              {permission === "denied" ? "Blocked in browser settings" : "Enable reminders"}
            </Button>
          )}
          <Link href="/settings/notifications" className="block text-center text-[13px] font-semibold text-accent">
            Reminder preferences
          </Link>
        </div>
      )}
    </Card>
  );
}
