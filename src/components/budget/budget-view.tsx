"use client";

import { ChevronDown, Copy, ListPlus, NotebookPen, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { MonthEndSummary } from "@/components/overview/month-end-summary";
import { Money } from "@/components/ui/money";
import { Button, Card, EmptyState, ProgressBar, Segmented, Skeleton, Textarea } from "@/components/ui/primitives";
import { ConfirmSheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addMonths, monthLabel, periodOf } from "@/lib/dates";
import { usePeriod } from "@/lib/data/app-context";
import { errorMessage } from "@/lib/data/errors";
import { useMonth, useToday } from "@/lib/data/hooks";
import { copyMonth, refreshAll, saveMonthNotes } from "@/lib/data/mutations";
import type { LineItem } from "@/lib/finance/summary";
import { AddItemSheet } from "./add-item-sheet";
import { ItemRow } from "./item-row";
import { ItemSheet } from "./item-sheet";
import { usePayToggle } from "./use-pay-toggle";

type Tab = "expense" | "income";

export function BudgetView() {
  const { period } = usePeriod();
  const today = useToday();
  const toast = useToast();
  const { items, summary, data, isLoading, error } = useMonth(period);
  const pay = usePayToggle();
  const [tab, setTab] = useState<Tab>("expense");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [copying, setCopying] = useState(false);

  const list = useMemo(() => (items ?? []).filter((i) => i.kind === tab), [items, tab]);
  const open = list.filter((i) => pay.stateOf(i) !== "paid");
  const settled = list.filter((i) => pay.stateOf(i) === "paid");
  const selected = items?.find((i) => i.id === selectedId) ?? null;
  const prev = addMonths(period, -1);

  async function doCopy() {
    setCopying(true);
    try {
      const n = await copyMonth(prev, period);
      await refreshAll();
      toast.success(n ? `Copied ${n} change${n === 1 ? "" : "s"} from ${monthLabel(prev)}` : `${monthLabel(period)} already matches ${monthLabel(prev)}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCopying(false);
      setConfirmCopy(false);
    }
  }

  const isIncome = tab === "income";
  const totals = summary ? (isIncome ? summary.income : summary.expense) : null;

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle={monthLabel(period)}
        showMonth
        actions={
          <Button size="icon" variant="secondary" aria-label="Add item" onClick={() => setAdding(true)}>
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      {error ? (
        <Card className="p-5 text-[14px] text-negative">{errorMessage(error)}</Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* totals strip */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryTile
              active={tab === "expense"}
              onClick={() => setTab("expense")}
              label="Expenses"
              primary={summary?.expense.cash}
              primaryLabel="paid"
              secondary={summary?.expense.outstanding}
              secondaryLabel="outstanding"
              progress={summary?.progress.expensePct}
              color="var(--expense)"
            />
            <SummaryTile
              active={tab === "income"}
              onClick={() => setTab("income")}
              label="Income"
              primary={summary?.income.cash}
              primaryLabel="received"
              secondary={summary?.income.outstanding}
              secondaryLabel="expected"
              progress={summary?.progress.incomePct}
              color="var(--income)"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "expense", label: `Expenses${items ? ` · ${items.filter((i) => i.kind === "expense").length}` : ""}` },
                { value: "income", label: `Income${items ? ` · ${items.filter((i) => i.kind === "income").length}` : ""}` },
              ]}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmCopy(true)}>
                <Copy className="h-4 w-4" /> Copy {monthLabel(prev, "short").split(" ")[0]}
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            {isLoading && !items ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={<ListPlus className="h-6 w-6" />}
                title={`No ${isIncome ? "income" : "expense"} items for ${monthLabel(period)}`}
                body="Add a one-off item, copy last month's budget, or set up recurring items that appear every month."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" onClick={() => setAdding(true)}>
                      <Plus className="h-4 w-4" /> Add item
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmCopy(true)}>
                      <Copy className="h-4 w-4" /> Copy {monthLabel(prev, "short")}
                    </Button>
                    <Link href="/settings/recurring" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-accent hover:bg-accent-soft">
                      <Repeat className="h-4 w-4" /> Recurring
                    </Link>
                  </div>
                }
              />
            ) : (
              <>
                {open.length ? (
                  <Section title={isIncome ? "To receive" : "To pay"} total={open.reduce((s, i) => s + i.totalDue, 0)}>
                    {open.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        state={pay.stateOf(item)}
                        busy={pay.busyId === item.id}
                        today={today}
                        onToggle={() => pay.toggle(item)}
                        onOpen={() => setSelectedId(item.id)}
                      />
                    ))}
                  </Section>
                ) : (
                  <div className="px-5 py-6 text-center text-[14px] text-ink-2">
                    🎉 Everything {isIncome ? "received" : "paid"} for {monthLabel(period)}.
                  </div>
                )}
                {settled.length ? (
                  <div className="border-t border-line">
                    <button
                      type="button"
                      onClick={() => setShowSettled((s) => !s)}
                      className="flex w-full items-center justify-between px-5 py-3 text-[13px] font-semibold text-ink-3 hover:bg-surface-2"
                      aria-expanded={showSettled}
                    >
                      <span>
                        {isIncome ? "Received" : "Paid"} · {settled.length}
                      </span>
                      <span className="flex items-center gap-2">
                        <Money value={settled.reduce((s, i) => s + i.paid, 0)} />
                        <ChevronDown className={cn("h-4 w-4 transition-transform", showSettled && "rotate-180")} />
                      </span>
                    </button>
                    {showSettled ? (
                      <ul className="divide-y divide-line">
                        {settled.map((item) => (
                          <ItemRow
                            key={item.id}
                            item={item}
                            state={pay.stateOf(item)}
                            busy={pay.busyId === item.id}
                            today={today}
                            onToggle={() => pay.toggle(item)}
                            onOpen={() => setSelectedId(item.id)}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          {totals && summary ? (
            <Card className="p-5">
              <h2 className="text-[15px] font-semibold">{isIncome ? "Income" : "Expense"} budget</h2>
              <dl className="mt-3 space-y-2.5 text-[14px]">
                <Line label="Budgeted" value={<Money value={totals.budget} />} />
                <Line label={isIncome ? "Expected (actual)" : "Bills (actual)"} value={<Money value={totals.total} />} />
                {totals.variance !== 0 ? (
                  <Line
                    label="Variance"
                    value={
                      <Money
                        value={totals.variance}
                        signed
                        className={(isIncome ? totals.variance < 0 : totals.variance > 0) ? "text-negative" : "text-positive"}
                      />
                    }
                  />
                ) : null}
                {totals.carriedIn > 0 ? <Line label="Carried in" value={<Money value={totals.carriedIn} className="text-warning" />} /> : null}
                <Line label={isIncome ? "Received this month" : "Paid this month"} value={<Money value={totals.cash} />} />
                <Line label={isIncome ? "Still expected" : "Outstanding"} value={<Money value={totals.outstanding} className="font-semibold" />} />
              </dl>
              <div className="mt-4 border-t border-line pt-4">
                <Line
                  label="Budgeted savings"
                  value={<Money value={summary.savings.budgeted} tone="auto" className="font-semibold" />}
                />
                <p className="mt-1 text-[12px] text-ink-3">Income budget minus expense budget for this month.</p>
              </div>
            </Card>
          ) : (
            <Skeleton className="h-64" />
          )}

          {data ? <MonthNotes key={data.budgetId} budgetId={data.budgetId} initial={data.notes ?? ""} /> : null}
          {summary && period <= periodOf(today) ? <MonthEndSummary period={period} summary={summary} today={today} /> : null}
        </aside>
      </div>

      <ItemSheet item={selected} onClose={() => setSelectedId(null)} />
      <AddItemSheet open={adding} onClose={() => setAdding(false)} period={period} defaultKind={tab} />
      <ConfirmSheet
        open={confirmCopy}
        onClose={() => setConfirmCopy(false)}
        onConfirm={doCopy}
        loading={copying}
        title={`Copy ${monthLabel(prev)} budget?`}
        confirmLabel="Copy budget"
        body={`Budget amounts for recurring items and any one-off items from ${monthLabel(prev)} will be copied into ${monthLabel(period)}. Existing items and payments are kept — nothing is duplicated.`}
      />
      <ConfirmSheet
        open={Boolean(pay.confirmUnpay)}
        onClose={() => pay.setConfirmUnpay(null)}
        onConfirm={() => pay.confirmUnpay && pay.unpay(pay.confirmUnpay)}
        loading={Boolean(pay.confirmUnpay && pay.busyId === pay.confirmUnpay.id)}
        destructive
        confirmLabel={pay.confirmUnpay?.kind === "income" ? "Mark not received" : "Mark unpaid"}
        title={`Undo ${pay.confirmUnpay?.name ?? ""}?`}
        body={
          pay.confirmUnpay
            ? `This removes the ${pay.confirmUnpay.paymentCount === 1 ? "payment" : "payments"} recorded on this item from your ledger. You can re-record them any time.`
            : null
        }
      />
    </>
  );
}

function Section({ title, total, children }: { title: string; total: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between px-5 pb-1 pt-4 text-[13px] font-semibold text-ink-3">
        <span>{title}</span>
        <Money value={total} />
      </div>
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function SummaryTile(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  primary?: number;
  primaryLabel: string;
  secondary?: number;
  secondaryLabel: string;
  progress?: number;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "rounded-[var(--radius-card)] border bg-surface p-4 text-left shadow-card transition active:scale-[0.99]",
        props.active ? "border-line-strong ring-2 ring-accent/40" : "border-line",
      )}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
        <span className="h-2 w-2 rounded-full" style={{ background: props.color }} aria-hidden />
        {props.label}
      </div>
      {props.primary === undefined ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <Money value={props.primary} className="mt-1 block text-[22px] font-bold tracking-[-0.03em] sm:text-[26px]" />
      )}
      <p className="text-[12px] text-ink-3">{props.primaryLabel}</p>
      <ProgressBar value={props.progress ?? 0} color={props.color} className="mt-3 h-1.5" label={`${props.label} progress`} />
      <p className="mt-2 text-[12px] text-ink-2">
        {props.secondary === undefined ? "…" : <Money value={props.secondary} className="font-semibold" />} {props.secondaryLabel}
      </p>
    </button>
  );
}

function MonthNotes({ budgetId, initial }: { budgetId: string; initial: string }) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value !== initial;
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold">
        <NotebookPen className="h-4 w-4 text-ink-3" /> Month notes
      </h2>
      <Textarea
        className="mt-3"
        rows={3}
        value={value}
        maxLength={2000}
        placeholder="Reminders, one-off plans…"
        onChange={(e) => setValue(e.target.value)}
        aria-label="Month notes"
      />
      {dirty ? (
        <Button
          size="sm"
          className="mt-3"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await saveMonthNotes(budgetId, value);
              await refreshAll();
              toast.success("Notes saved");
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          Save notes
        </Button>
      ) : null}
    </Card>
  );
}

export type { LineItem };
