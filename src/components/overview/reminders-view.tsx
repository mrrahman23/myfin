"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { ItemRow } from "@/components/budget/item-row";
import { ItemSheet } from "@/components/budget/item-sheet";
import { usePayToggle } from "@/components/budget/use-pay-toggle";
import { PageHeader } from "@/components/shell/app-shell";
import { Money } from "@/components/ui/money";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { NotificationCard } from "@/components/settings/notification-card";
import { ConfirmSheet } from "@/components/ui/sheet";
import { useOpenItems, useSettings, useToday } from "@/lib/data/hooks";
import type { LineItem } from "@/lib/finance/summary";

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
