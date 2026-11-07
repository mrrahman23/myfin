"use client";

import { ChevronRight, CornerDownRight } from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Money } from "@/components/ui/money";
import { PayCheck, Pill } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatDate, monthLabel, relativeDue } from "@/lib/dates";
import { STATE_LABEL, type LineItem } from "@/lib/finance/summary";

export function ItemRow({
  item,
  state,
  busy,
  today,
  onToggle,
  onOpen,
  showPeriod = false,
}: {
  item: LineItem;
  state: LineItem["state"];
  busy: boolean;
  today: string;
  onToggle: () => void;
  onOpen: () => void;
  showPeriod?: boolean;
}) {
  const settled = state === "paid";
  const year = +today.slice(0, 4);
  const amount = settled ? item.paid || item.charge : item.totalDue;

  let meta: React.ReactNode;
  if (settled) {
    meta = item.lastPaidOn ? `${item.kind === "income" ? "Received" : "Paid"} ${formatDate(item.lastPaidOn, year)}` : STATE_LABEL[item.kind].paid;
  } else if (item.dueDate) {
    meta = (
      <span className={cn(item.overdue && "font-medium text-negative")}>
        {item.overdue || (item.daysUntilDue ?? 99) <= 3 ? relativeDue(item.dueDate, today) : `Due ${formatDate(item.dueDate, year)}`}
      </span>
    );
  } else {
    meta = item.group ?? item.categoryName;
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors sm:px-5",
        "cursor-pointer hover:bg-surface-2 active:bg-surface-3/60",
      )}
      onClick={onOpen}
    >
      <PayCheck
        state={state}
        busy={busy}
        tone={item.kind}
        onToggle={onToggle}
        label={`${item.name}: ${STATE_LABEL[item.kind][state]}. ${settled ? "Tap to mark not " + (item.kind === "income" ? "received" : "paid") : "Tap to mark " + (item.kind === "income" ? "received" : "paid")}`}
      />
      <CategoryIcon icon={item.icon} kind={item.kind} className="hidden sm:grid" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-[15px] font-medium tracking-[-0.01em]", settled && "text-ink-3")}>{item.name}</p>
          {item.isCarriedRow || showPeriod ? (
            <Pill tone="warning" className="shrink-0">
              <CornerDownRight className="h-3 w-3" />
              {monthLabel(item.period, "short")}
            </Pill>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-3">
          {meta}
          {state === "partial" ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-warning">{STATE_LABEL[item.kind].partial}</span>
            </>
          ) : null}
          {item.carriedIn > 0 && !settled ? (
            <>
              <span aria-hidden>·</span>
              <span>
                incl. <Money value={Math.min(item.carriedIn, item.totalDue)} /> carried
              </span>
            </>
          ) : null}
        </p>
      </div>
      <div className="text-right">
        <Money
          value={amount}
          className={cn(
            "block text-[15px] font-semibold tracking-[-0.01em]",
            settled ? "text-ink-3 line-through decoration-1" : item.kind === "income" ? "text-positive" : "text-ink",
          )}
        />
        {item.hasActual && item.variance !== 0 ? (
          <span className={cn("text-[11.5px] font-medium", (item.kind === "expense" ? item.variance > 0 : item.variance < 0) ? "text-negative" : "text-positive")}>
            <Money value={item.variance} signed /> vs budget
          </span>
        ) : state === "partial" ? (
          <span className="text-[11.5px] text-ink-3">
            <Money value={item.paid} /> paid
          </span>
        ) : null}
      </div>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-3 sm:block" aria-hidden />
    </li>
  );
}
