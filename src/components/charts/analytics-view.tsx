"use client";

import { ChevronLeft, ChevronRight, Table2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Money } from "@/components/ui/money";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { monthLabel, periodOf } from "@/lib/dates";
import { usePeriod } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import { useOpenItems, useToday, useYear } from "@/lib/data/hooks";
import { foldSlices } from "@/lib/finance/analytics";
import { CashflowChart, CategoryDonut, SavingsChart, VarianceChart } from "./charts";

export function AnalyticsView() {
  const { period } = usePeriod();
  const [year, setYear] = useState(() => +period.slice(0, 4));
  const { analytics: a, error, isLoading } = useYear(year);
  const { items: open } = useOpenItems();
  const [showTable, setShowTable] = useState(false);

  const today = useToday();
  const currentPeriod = periodOf(today);
  // Liabilities = unpaid items from months up to now (future months are not yet owed)
  const through = `${year}-12-01` < currentPeriod ? `${year}-12-01` : currentPeriod;
  const liabilities = (open ?? []).filter((i) => i.kind === "expense" && i.period <= through);
  const liabilityTotal = liabilities.reduce((s, i) => s + i.totalDue, 0);
  const receivables = (open ?? []).filter((i) => i.kind === "income" && i.period <= through).reduce((s, i) => s + i.totalDue, 0);
  const elapsed = a?.months.filter((m) => m.period <= currentPeriod) ?? [];

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Annual overview"
        actions={
          <div className="flex items-center rounded-full border border-line bg-surface p-1 shadow-card">
            <button type="button" aria-label="Previous year" onClick={() => setYear((y) => y - 1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-surface-3">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[64px] text-center text-[14px] font-semibold tabular">{year}</span>
            <button type="button" aria-label="Next year" onClick={() => setYear((y) => y + 1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-surface-3">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {error ? <Card className="mb-4 p-5 text-[14px] text-negative">{errorMessage(error)}</Card> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Income received" value={a?.incomeReceived} tone="text-positive" />
        <Kpi label="Expenses paid" value={a?.expensesPaid} />
        <Kpi
          label="Annual savings"
          value={a?.savings}
          tone={a && a.savings < 0 ? "text-negative" : "text-positive"}
          sub={a && a.incomeReceived > 0 ? `${Math.round(a.savingsRate * 100)}% of income` : undefined}
        />
        <Kpi label="Avg. monthly expenses" value={a?.averageMonthlyExpense} sub="months with spending" />
        <Kpi
          label="Highest spending"
          value={a?.highestMonth?.expense}
          sub={a?.highestMonth ? monthLabel(a.highestMonth.period) : "—"}
        />
        <Kpi label="Lowest spending" value={a?.lowestMonth?.expense} sub={a?.lowestMonth ? monthLabel(a.lowestMonth.period) : "—"} />
        <Kpi label="Outstanding liabilities" value={open ? liabilityTotal : undefined} tone={liabilityTotal > 0 ? "text-negative" : undefined} sub={`${liabilities.length} unpaid item${liabilities.length === 1 ? "" : "s"}`} />
        <Kpi label="Receivables" value={open ? receivables : undefined} sub="income not yet received" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Income vs expenses by month"
            subtitle="Cash basis — by payment date"
            action={
              <button
                type="button"
                onClick={() => setShowTable((s) => !s)}
                aria-pressed={showTable}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold", showTable ? "bg-ink text-inverse" : "bg-surface-3 text-ink-2")}
              >
                <Table2 className="h-3.5 w-3.5" /> Table
              </button>
            }
          />
          <div className="p-5 pt-3">
            {!a ? (
              <Skeleton className="h-64" />
            ) : showTable ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px] tabular">
                  <thead>
                    <tr className="text-left text-ink-3">
                      <th className="px-1 py-2 font-medium">Month</th>
                      <th className="px-1 py-2 text-right font-medium">Budgeted income</th>
                      <th className="px-1 py-2 text-right font-medium">Received</th>
                      <th className="px-1 py-2 text-right font-medium">Budgeted expenses</th>
                      <th className="px-1 py-2 text-right font-medium">Paid</th>
                      <th className="px-1 py-2 text-right font-medium">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {a.months.map((m) => (
                      <tr key={m.period}>
                        <td className="px-1 py-2">{monthLabel(m.period, "short")}</td>
                        <td className="px-1 py-2 text-right text-ink-3"><Money value={m.budgetIncome} /></td>
                        <td className="px-1 py-2 text-right"><Money value={m.income} /></td>
                        <td className="px-1 py-2 text-right text-ink-3"><Money value={m.budgetExpense} /></td>
                        <td className="px-1 py-2 text-right"><Money value={m.expense} /></td>
                        <td className="px-1 py-2 text-right font-semibold"><Money value={m.savings} tone="auto" signed /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CashflowChart points={a.months} height={280} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Monthly savings trend" subtitle="Income received minus expenses paid" />
          <div className="p-5 pt-3">
            {!a ? (
              <Skeleton className="h-56" />
            ) : elapsed.length ? (
              <SavingsChart points={elapsed} />
            ) : (
              <EmptyState title={`${year} hasn't started yet`} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Spending by category" subtitle={`${year} · expenses paid`} />
          <div className="p-5 pt-3">
            {!a ? (
              <Skeleton className="h-56" />
            ) : a.categorySpending.length === 0 ? (
              <EmptyState title="No spending recorded" body={`Nothing was paid in ${year}.`} />
            ) : (
              <CategoryDonut slices={foldSlices(a.categorySpending, 8)} total={a.expensesPaid} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Budget variance" subtitle="Actual paid minus budget, by category" />
          <div className="p-5 pt-3">{a ? <VarianceChart rows={a.budgetVsActual} /> : <Skeleton className="h-56" />}</div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Budget vs actual"
            subtitle={a ? <>Through {monthLabel(through, "short")} · Budget <Money value={a.budgetedExpenses} /> · Paid <Money value={a.expensesPaid} /></> : null}
          />
          {!a ? (
            <Skeleton className="m-5 h-56" />
          ) : a.budgetVsActual.length === 0 ? (
            <EmptyState title="No budget data" body={`Open a month in ${year} to start budgeting.`} />
          ) : (
            <div className="max-h-[420px] overflow-y-auto px-5 pb-4 pt-2">
              <table className="w-full text-[13px] tabular">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-ink-3">
                    <th className="py-2 font-medium">Category</th>
                    <th className="py-2 text-right font-medium">Budget</th>
                    <th className="py-2 text-right font-medium">Actual</th>
                    <th className="py-2 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {a.budgetVsActual.map((r) => (
                    <tr key={r.categoryId}>
                      <td className="max-w-[140px] truncate py-2 pr-2">{r.name}</td>
                      <td className="py-2 text-right text-ink-3"><Money value={r.budget} /></td>
                      <td className="py-2 text-right"><Money value={r.actual} /></td>
                      <td className={cn("py-2 text-right font-semibold", r.variance > 0 ? "text-negative" : r.variance < 0 ? "text-positive" : "text-ink-3")}>
                        <Money value={r.variance} signed />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {isLoading ? <span className="sr-only">Loading analytics</span> : null}
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number | undefined; sub?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <Money value={value} className={cn("mt-1 block text-[20px] font-bold tracking-[-0.03em] sm:text-[22px]", tone)} />
      )}
      {sub ? <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{sub}</p> : null}
    </Card>
  );
}
