"use client";

import { Sparkles } from "lucide-react";
import { Money } from "@/components/ui/money";
import { Card } from "@/components/ui/primitives";
import { addMonths, lastDayOf, daysBetween, monthLabel } from "@/lib/dates";
import type { MonthSummary } from "@/lib/finance/summary";

/** Month-end review: shown for past months and during the last week of the current one. */
export function MonthEndSummary({ period, summary, today }: { period: string; summary: MonthSummary; today: string }) {
  const end = lastDayOf(period);
  const daysLeft = daysBetween(today, end);
  if (daysLeft > 6) return null;
  const finished = daysLeft < 0;
  const saved = summary.savings.actual;
  const rate = summary.income.cash > 0 ? saved / summary.income.cash : 0;
  const carry = summary.expense.outstanding;
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] px-5 py-4 text-white">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/70">
          <Sparkles className="h-3.5 w-3.5" /> {finished ? "Month in review" : `${daysLeft + 1} day${daysLeft === 0 ? "" : "s"} left`}
        </p>
        <p className="mt-1 text-[17px] font-semibold">{monthLabel(period)}</p>
      </div>
      <dl className="space-y-2.5 p-5 text-[14px]">
        <div className="flex justify-between">
          <dt className="text-ink-2">Money in</dt>
          <dd><Money value={summary.income.cash} /></dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">Money out</dt>
          <dd><Money value={summary.expense.cash} /></dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">{saved >= 0 ? "Saved" : "Overspent"}</dt>
          <dd className="font-semibold">
            <Money value={Math.abs(saved)} className={saved >= 0 ? "text-positive" : "text-negative"} />
            {summary.income.cash > 0 ? <span className="ml-1 text-[12px] font-normal text-ink-3">({Math.round(rate * 100)}%)</span> : null}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">Items settled</dt>
          <dd className="tabular">
            {summary.progress.itemsSettled} / {summary.progress.itemsTotal}
          </dd>
        </div>
        {carry > 0 ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-[12.5px] text-ink-2">
            <Money value={carry} className="font-semibold" /> unpaid {finished ? "carries" : "will carry"} into {monthLabel(addMonths(period, 1))} for
            categories with carry-forward on.
          </p>
        ) : (
          <p className="rounded-xl bg-positive-soft px-3 py-2 text-[12.5px] text-positive">All expenses settled. Nothing carries forward.</p>
        )}
      </dl>
    </Card>
  );
}
