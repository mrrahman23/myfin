"use client";

import { Download, Plus, ReceiptText, Search, SlidersHorizontal, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { PageHeader, useQuickAdd } from "@/components/shell/app-shell";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Money } from "@/components/ui/money";
import { Button, Card, EmptyState, Field, Input, Segmented, Select, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { toCSV, downloadFile } from "@/lib/csv";
import { addMonths, formatDate, isValidISODate, lastDayOf, periodOf, toISODate, weekdayOf } from "@/lib/dates";
import { errorMessage } from "@/lib/data/errors";
import { useCategories, usePaymentMethods, useToday, useTransactions, type TransactionFilters } from "@/lib/data/hooks";
import { toDecimalString, toMinor } from "@/lib/money";
import type { TransactionKind } from "@/lib/types";

type Preset = "this-month" | "last-month" | "last-90" | "this-year" | "custom";

function rangeFor(preset: Preset, today: string): { from: string; to: string } {
  const p = periodOf(today);
  switch (preset) {
    case "this-month":
      return { from: p, to: lastDayOf(p) };
    case "last-month":
      return { from: addMonths(p, -1), to: lastDayOf(addMonths(p, -1)) };
    case "last-90": {
      const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - 89));
      return { from: toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), to: today };
    }
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    default:
      return { from: p, to: lastDayOf(p) };
  }
}

const PRESETS: Array<{ value: Preset; label: string }> = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-90", label: "90 days" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export function TransactionsView() {
  const today = useToday();
  const toast = useToast();
  const quick = useQuickAdd();
  const { data: categories } = useCategories();
  const { data: methods } = usePaymentMethods();
  const [preset, setPreset] = useState<Preset>("this-month");
  const [custom, setCustom] = useState(() => rangeFor("this-month", today));
  const [kind, setKind] = useState<TransactionKind | "all">("all");
  const [categoryId, setCategoryId] = useState("all");
  const [methodId, setMethodId] = useState("all");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const range = preset === "custom" ? custom : rangeFor(preset, today);
  const filters: TransactionFilters = {
    from: range.from,
    to: range.to,
    kind,
    categoryId,
    paymentMethodId: methodId,
    search: deferredSearch,
  };
  const { data, isLoading, error } = useTransactions(filters);

  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const methodMap = useMemo(() => new Map((methods ?? []).map((m) => [m.id, m])), [methods]);

  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>>();
    for (const t of data ?? []) map.set(t.txn_date, [...(map.get(t.txn_date) ?? []), t]);
    return [...map.entries()];
  }, [data]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of data ?? []) {
      if (t.kind === "income") income += toMinor(t.amount);
      if (t.kind === "expense") expense += toMinor(t.amount);
    }
    return { income, expense };
  }, [data]);

  const activeFilters = (kind !== "all" ? 1 : 0) + (categoryId !== "all" ? 1 : 0) + (methodId !== "all" ? 1 : 0);
  const year = +today.slice(0, 4);

  function exportCsv() {
    if (!data?.length) return toast.show("Nothing to export for these filters");
    try {
      const csv = toCSV(
        ["Date", "Type", "Description", "Category", "Payment method", "To account", "Amount", "Linked item", "Notes"],
        data.map((t) => [
          t.txn_date,
          t.kind,
          t.description ?? "",
          t.category_id ? (catMap.get(t.category_id)?.name ?? "") : "",
          t.payment_method_id ? (methodMap.get(t.payment_method_id)?.name ?? "") : "",
          t.to_payment_method_id ? (methodMap.get(t.to_payment_method_id)?.name ?? "") : "",
          toDecimalString(toMinor(t.amount)),
          t.obligation_id ? "yes" : "",
          t.notes ?? "",
        ]),
      );
      downloadFile(`myfin-transactions-${range.from}-to-${range.to}.csv`, csv);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${formatDate(range.from, year)} – ${formatDate(range.to, year)}`}
        actions={
          <>
            <Button size="icon" variant="secondary" aria-label="Export CSV" onClick={exportCsv}>
              <Download className="h-[18px] w-[18px]" />
            </Button>
            <Button size="icon" aria-label="Add transaction" onClick={() => quick.openNew()}>
              <Plus className="h-5 w-5" />
            </Button>
          </>
        }
      />

      <div className="sticky top-0 z-20 -mx-4 mb-4 space-y-3 bg-bg/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description or notes"
              aria-label="Search transactions"
              className="h-11 pl-10"
            />
          </div>
          <Button variant="secondary" className="relative h-11 px-4" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilters ? (
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">
                {activeFilters}
              </span>
            ) : null}
          </Button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                if (p.value === "custom") {
                  setCustom(range);
                  setFiltersOpen(true);
                }
                setPreset(p.value);
              }}
              className={cn(
                "h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition",
                preset === p.value ? "bg-ink text-inverse" : "bg-surface text-ink-2 shadow-card hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-3.5">
          <p className="text-[11.5px] text-ink-3">Income</p>
          <Money value={totals.income} className="text-[17px] font-semibold text-positive" />
        </Card>
        <Card className="p-3.5">
          <p className="text-[11.5px] text-ink-3">Expenses</p>
          <Money value={totals.expense} className="text-[17px] font-semibold" />
        </Card>
        <Card className="p-3.5">
          <p className="text-[11.5px] text-ink-3">Net</p>
          <Money value={totals.income - totals.expense} tone="auto" signed className="text-[17px] font-semibold" />
        </Card>
      </div>

      {error ? <Card className="p-5 text-[14px] text-negative">{errorMessage(error)}</Card> : null}

      {isLoading && !data ? (
        <Card className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </Card>
      ) : !data?.length ? (
        <Card>
          <EmptyState
            icon={<ReceiptText className="h-6 w-6" />}
            title={search || activeFilters ? "No matching transactions" : "No transactions in this period"}
            body={search || activeFilters ? "Try a different search or clear the filters." : "Payments you record from the budget appear here automatically."}
            action={
              search || activeFilters ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setKind("all");
                    setCategoryId("all");
                    setMethodId("all");
                  }}
                >
                  <X className="h-4 w-4" /> Clear filters
                </Button>
              ) : (
                <Button size="sm" onClick={() => quick.openNew()}>
                  <Plus className="h-4 w-4" /> Add transaction
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, list]) => {
            const dayNet = list.reduce(
              (s, t) => s + (t.kind === "income" ? toMinor(t.amount) : t.kind === "expense" ? -toMinor(t.amount) : t.kind === "adjustment" ? toMinor(t.amount) : 0),
              0,
            );
            return (
              <section key={date}>
                <div className="mb-1.5 flex items-center justify-between px-1 text-[12.5px] font-semibold text-ink-3">
                  <span>
                    {date === today ? "Today" : `${weekdayOf(date)}, ${formatDate(date, year)}`}
                  </span>
                  <Money value={dayNet} signed />
                </div>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {list.map((t) => (
                      <TransactionRow key={t.id} t={t} categories={catMap} methods={methodMap} onClick={() => quick.openEdit(t)} />
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
          <p className="pb-2 text-center text-[12px] text-ink-3">
            {data.length} transaction{data.length === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        <div className="space-y-4">
          <Field label="Type">
            <Segmented
              className="w-full"
              size="sm"
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "All" },
                { value: "income", label: "Income" },
                { value: "expense", label: "Expense" },
                { value: "transfer", label: "Transfer" },
                { value: "adjustment", label: "Adjust" },
              ]}
            />
          </Field>
          <Field label="Category" htmlFor="f-cat">
            <Select id="f-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="all">All categories</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === "income" ? "↓ " : "↑ "}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Payment method" htmlFor="f-method">
            <Select id="f-method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="all">All methods</option>
              {(methods ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="f-from">
              <Input
                id="f-from"
                type="date"
                value={range.from}
                onChange={(e) => {
                  if (!isValidISODate(e.target.value)) return;
                  setCustom({ from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to });
                  setPreset("custom");
                }}
              />
            </Field>
            <Field label="To" htmlFor="f-to">
              <Input
                id="f-to"
                type="date"
                value={range.to}
                onChange={(e) => {
                  if (!isValidISODate(e.target.value)) return;
                  setCustom({ from: range.from > e.target.value ? e.target.value : range.from, to: e.target.value });
                  setPreset("custom");
                }}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setKind("all");
                setCategoryId("all");
                setMethodId("all");
                setPreset("this-month");
              }}
            >
              Reset
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Show results</Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
