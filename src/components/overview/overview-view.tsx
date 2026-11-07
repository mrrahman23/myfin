"use client";

import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarClock,
  ChartPie,
  ChevronRight,
  Clock,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemRow } from "@/components/budget/item-row";
import { ItemSheet } from "@/components/budget/item-sheet";
import { usePayToggle } from "@/components/budget/use-pay-toggle";
import { CashflowChart } from "@/components/charts/charts";
import { PageHeader, useQuickAdd } from "@/components/shell/app-shell";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Money } from "@/components/ui/money";
import { Button, Card, CardHeader, EmptyState, ProgressBar, Skeleton } from "@/components/ui/primitives";
import { ConfirmSheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { monthLabel, periodOf } from "@/lib/dates";
import { usePeriod, useSession } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, useMonth, useOpenItems, usePaymentMethods, useProfile, useSeries, useSettings, useToday } from "@/lib/data/hooks";
import { toMinor } from "@/lib/money";
import { MonthEndSummary } from "./month-end-summary";

function greeting(timeZone: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date()));
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function OverviewView() {
  const { period } = usePeriod();
  const today = useToday();
  const { user } = useSession();
  const { data: profile } = useProfile();
  const { data: settings } = useSettings();
  const { summary, data, error, isLoading } = useMonth(period);
  const { items: openItems } = useOpenItems();
  const { points } = useSeries(period, 6);
  const { data: categories } = useCategories();
  const { data: methods } = usePaymentMethods();
  const quick = useQuickAdd();
  const pay = usePayToggle();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const router = useRouter();
  useEffect(() => {
    if (settings && settings.finance_enabled === false) router.replace("/household");
  }, [settings, router]);

  const firstName = (profile?.full_name || user?.email?.split("@")[0] || "").split(" ")[0];
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const methodMap = useMemo(() => new Map((methods ?? []).map((m) => [m.id, m])), [methods]);
  const windowDays = Math.max(7, settings?.reminder_days_before ?? 7);

  const overdue = (openItems ?? []).filter((i) => i.overdue).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const upcoming = (openItems ?? [])
    .filter((i) => !i.overdue && i.daysUntilDue !== null && i.daysUntilDue >= 0 && i.daysUntilDue <= windowDays)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const spending = useMemo(() => {
    if (!data) return [];
    const map = new Map<string | null, number>();
    for (const t of data.transactions) if (t.kind === "expense") map.set(t.category_id, (map.get(t.category_id) ?? 0) + toMinor(t.amount));
    return [...map.entries()]
      .map(([id, amount]) => ({ id, name: id ? (catMap.get(id)?.name ?? "Deleted category") : "Uncategorised", amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [data, catMap]);
  const spendTotal = spending.reduce((s, x) => s + x.amount, 0);

  const s = summary;
  const saving = s ? s.savings.actual >= 0 : true;

  return (
    <>
      <PageHeader
        actions={
          <Link href="/analytics" aria-label="Analytics" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-card lg:hidden">
            <ChartPie className="h-[18px] w-[18px]" />
          </Link>
        }
        title={firstName ? `${greeting(settings?.timezone ?? "Asia/Dhaka")}, ${firstName}` : greeting(settings?.timezone ?? "Asia/Dhaka")} subtitle={monthLabel(period)} showMonth />

      {error ? <Card className="mb-4 p-5 text-[14px] text-negative">{errorMessage(error)}</Card> : null}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Hero — available balance */}
        <section
          className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] p-6 text-white shadow-float lg:col-span-7"
          aria-label="Available balance"
        >
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/[0.06]" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-[#2a78d6]/30 blur-2xl" aria-hidden />
          <div className="relative">
            <p className="flex items-center gap-2 text-[13px] font-medium text-white/70">
              <Wallet className="h-4 w-4" /> Available balance
            </p>
            {s ? (
              <Money value={s.available} className="mt-1 block text-[42px] font-bold leading-tight tracking-[-0.04em] sm:text-[48px]" />
            ) : (
              <div className="mt-2 h-12 w-48 animate-pulse rounded-xl bg-white/15" />
            )}
            <p className="text-[12.5px] text-white/60">
              Income received − expenses paid{s && s.adjustments !== 0 ? " + adjustments" : ""} · {monthLabel(period, "short")}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
                <p className="flex items-center gap-1.5 text-[12px] text-white/70">
                  <ArrowDownLeft className="h-3.5 w-3.5" /> Came in
                </p>
                {s ? <Money value={s.income.cash} className="mt-0.5 block text-[19px] font-semibold" /> : <div className="mt-1 h-6 w-20 rounded bg-white/15" />}
              </div>
              <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
                <p className="flex items-center gap-1.5 text-[12px] text-white/70">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Went out
                </p>
                {s ? <Money value={s.expense.cash} className="mt-0.5 block text-[19px] font-semibold" /> : <div className="mt-1 h-6 w-20 rounded bg-white/15" />}
              </div>
            </div>
            {s ? (
              <div
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold",
                  saving ? "bg-[#34c759]/20 text-[#7ee2a0]" : "bg-[#ff6961]/20 text-[#ffb0ab]",
                )}
              >
                {saving ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {saving ? "Saving " : "Overspending "}
                <Money value={Math.abs(s.savings.actual)} />
                <span className="font-normal opacity-80">this month</span>
              </div>
            ) : null}
          </div>
        </section>

        {/* Progress & pending */}
        <Card className="flex flex-col p-5 lg:col-span-5">
          <h2 className="text-[15px] font-semibold">Monthly progress</h2>
          {s ? (
            <div className="mt-4 space-y-5">
              <ProgressLine
                label="Income received"
                value={s.income.cash}
                rest={s.income.outstanding}
                restLabel="expected"
                pct={s.progress.incomePct}
                color="var(--income)"
              />
              <ProgressLine
                label="Expenses paid"
                value={s.expense.cash}
                rest={s.expense.outstanding}
                restLabel="outstanding"
                pct={s.progress.expensePct}
                color="var(--expense)"
              />
              <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-[12px] text-ink-3">Items settled</p>
                  <p className="text-[17px] font-semibold tabular">
                    {s.progress.itemsSettled}
                    <span className="text-ink-3"> / {s.progress.itemsTotal}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-ink-3">Projected month end</p>
                  <Money value={s.savings.projected} tone="auto" signed className="text-[17px] font-semibold" />
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-14" />
            </div>
          )}
        </Card>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12">
          <Stat label="Total monthly income" value={s?.income.total} sub={s ? <>Budget <Money value={s.income.budget} /></> : null} icon={ArrowDownLeft} tone="income" />
          <Stat label="Income received" value={s?.income.cash} sub="this month" icon={ArrowDownLeft} tone="income" />
          <Stat label="Expected income" value={s?.income.outstanding} sub="not yet received" icon={Clock} tone="income" />
          <Stat
            label="Monthly savings"
            value={s?.savings.actual}
            sub={s ? <>Budgeted <Money value={s.savings.budgeted} /></> : null}
            icon={PiggyBank}
            tone={saving ? "positive" : "negative"}
            signed
          />
          <Stat label="Total monthly expenses" value={s?.expense.total} sub={s ? <>Budget <Money value={s.expense.budget} /></> : null} icon={ArrowUpRight} tone="expense" />
          <Stat label="Expenses paid" value={s?.expense.cash} sub="this month" icon={ArrowUpRight} tone="expense" />
          <Stat
            label="Outstanding expenses"
            value={s?.expense.outstanding}
            sub={s && s.expense.carriedIn > 0 ? <>incl. <Money value={s.expense.carriedIn} /> carried</> : "still to pay"}
            icon={CalendarClock}
            tone="expense"
          />
          <Stat
            label="Overdue"
            value={s?.overdueAmount}
            sub={s ? `${s.counts.overdue} item${s.counts.overdue === 1 ? "" : "s"}` : null}
            icon={AlertTriangle}
            tone={s && s.overdueAmount > 0 ? "negative" : "neutral"}
          />
        </div>

        {/* Pending payments */}
        <Card className="overflow-hidden lg:col-span-7">
          <CardHeader
            title="Pending payments"
            subtitle={overdue.length ? `${overdue.length} overdue · ${upcoming.length} due in ${windowDays} days` : `Due in the next ${windowDays} days`}
            action={
              <Link href="/reminders" className="flex items-center gap-1 text-[13px] font-semibold text-accent">
                <Bell className="h-3.5 w-3.5" /> All
              </Link>
            }
          />
          {!openItems ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : overdue.length + upcoming.length === 0 ? (
            <EmptyState title="You're all caught up" body={`Nothing overdue and nothing due in the next ${windowDays} days.`} />
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {[...overdue, ...upcoming].slice(0, 8).map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  state={pay.stateOf(item)}
                  busy={pay.busyId === item.id}
                  today={today}
                  showPeriod={periodOf(item.period) !== period}
                  onToggle={() => pay.toggle(item)}
                  onOpen={() => setSelectedId(item.id)}
                />
              ))}
            </ul>
          )}
          <div className="px-5 pb-4 pt-2">
            <Link href="/budget" className="flex items-center justify-center gap-1 rounded-xl py-2.5 text-[14px] font-semibold text-accent hover:bg-accent-soft">
              Open monthly budget <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>

        {/* Category breakdown */}
        <Card className="lg:col-span-5">
          <CardHeader title="Spending by category" subtitle={monthLabel(period)} />
          <div className="p-5 pt-3">
            {isLoading && !data ? (
              <Skeleton className="h-40" />
            ) : spending.length === 0 ? (
              <EmptyState title="No spending yet" body="Expenses you pay this month will be broken down here." />
            ) : (
              <ul className="space-y-3">
                {spending.slice(0, 7).map((c) => (
                  <li key={c.id ?? "none"}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="truncate text-ink-2">{c.name}</span>
                      <Money value={c.amount} className="font-semibold" />
                    </div>
                    <ProgressBar value={spendTotal ? c.amount / spending[0].amount : 0} color="var(--expense)" className="h-1.5" label={c.name} />
                  </li>
                ))}
                {spending.length > 7 ? (
                  <li className="text-[12px] text-ink-3">+ {spending.length - 7} more categories</li>
                ) : null}
              </ul>
            )}
          </div>
        </Card>

        {/* Cash flow chart */}
        <Card className="lg:col-span-7">
          <CardHeader title="Income vs expenses" subtitle="Last 6 months, by payment date" />
          <div className="p-5 pt-3">{points ? <CashflowChart points={points} /> : <Skeleton className="h-60" />}</div>
        </Card>

        {/* Recent */}
        <Card className="overflow-hidden lg:col-span-5">
          <CardHeader
            title="Recent transactions"
            action={
              <Link href="/transactions" className="text-[13px] font-semibold text-accent">
                See all
              </Link>
            }
          />
          {!data ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : data.transactions.length === 0 ? (
            <EmptyState
              title="No transactions this month"
              body="Tick an item in your budget or add one here."
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="tinted" onClick={() => quick.openNew({ kind: "expense" })}>
                    Add expense
                  </Button>
                  <Button size="sm" variant="tinted" onClick={() => quick.openNew({ kind: "income" })}>
                    Add income
                  </Button>
                </div>
              }
            />
          ) : (
            <ul className="mt-2 divide-y divide-line pb-2">
              {data.transactions.slice(0, 6).map((t) => (
                <TransactionRow key={t.id} t={t} categories={catMap} methods={methodMap} showDate year={+today.slice(0, 4)} onClick={() => quick.openEdit(t)} />
              ))}
            </ul>
          )}
        </Card>

        {s && period <= periodOf(today) ? (
          <div className="lg:col-span-5 lg:col-start-8">
            <MonthEndSummary period={period} summary={s} today={today} />
          </div>
        ) : null}
      </div>

      <ItemSheet item={openItems?.find((i) => i.id === selectedId) ?? null} onClose={() => setSelectedId(null)} />
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

function ProgressLine(props: { label: string; value: number; rest: number; restLabel: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink-2">{props.label}</span>
        <span className="text-[13px] font-semibold tabular">{Math.round(props.pct * 100)}%</span>
      </div>
      <ProgressBar value={props.pct} color={props.color} label={props.label} />
      <div className="mt-1.5 flex justify-between text-[12px] text-ink-3">
        <Money value={props.value} />
        <span>
          <Money value={props.rest} /> {props.restLabel}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  signed,
}: {
  label: string;
  value: number | undefined;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone: "income" | "expense" | "positive" | "negative" | "neutral";
  signed?: boolean;
}) {
  const tones = {
    income: "text-income bg-accent-soft",
    expense: "text-expense bg-[color-mix(in_oklab,var(--expense)_13%,transparent)]",
    positive: "text-positive bg-positive-soft",
    negative: "text-negative bg-negative-soft",
    neutral: "text-ink-2 bg-surface-3",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-tight text-ink-3">{label}</p>
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <Money
          value={value}
          signed={signed}
          className={cn(
            "mt-1.5 block text-[20px] font-bold tracking-[-0.03em] sm:text-[22px]",
            tone === "negative" && value !== 0 && "text-negative",
            tone === "positive" && signed && "text-positive",
          )}
        />
      )}
      {sub ? <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{sub}</p> : null}
    </Card>
  );
}
