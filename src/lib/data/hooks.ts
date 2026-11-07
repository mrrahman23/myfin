"use client";

import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { addMonths, DEFAULT_TIMEZONE, lastDayOf, periodOf, todayISO, toISODate } from "../dates";
import { analyzeYear, type MonthPoint } from "../finance/analytics";
import { carriedRows, sortItems, summarizeMonth, toLineItem } from "../finance/summary";
import { toMinor } from "../money";
import { getSupabase } from "../supabase/client";
import type {
  Category,
  ObligationBalance,
  ObligationStatusRow,
  PaymentAllocation,
  PaymentMethod,
  Profile,
  RecurringRule,
  Transaction,
  TransactionKind,
  UserSettings,
} from "../types";
import { applyTheme, useSession } from "./app-context";
import { unwrap } from "./errors";

const PAGE = 1000;

/** Fetches every row of a query in pages of 1,000 (PostgREST's default cap). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: import("@supabase/supabase-js").PostgrestError | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(await build(from, from + PAGE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function useUserKey() {
  const { user } = useSession();
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Settings / profile
// ---------------------------------------------------------------------------
export function useSettings() {
  const uid = useUserKey();
  const swr = useSWR(uid ? ["settings", uid] : null, async () => {
    const supabase = getSupabase();
    let row = unwrap(await supabase.from("user_settings").select("*").maybeSingle()) as UserSettings | null;
    if (!row) {
      // account created before the migration — seed defaults once
      unwrap(await supabase.rpc("seed_my_defaults"));
      row = unwrap(await supabase.from("user_settings").select("*").maybeSingle()) as UserSettings | null;
    }
    return row;
  });
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const theme = swr.data?.theme;
    if (theme && applied.current !== theme) {
      applied.current = theme;
      applyTheme(theme);
    }
  }, [swr.data?.theme]);
  return swr;
}

export function useTimezone() {
  return useSettings().data?.timezone ?? DEFAULT_TIMEZONE;
}

export function useCurrency() {
  return useSettings().data?.currency ?? "BDT";
}

/** Today's date in the user's timezone, refreshed every minute. */
export function useToday() {
  const tz = useTimezone();
  const { data } = useSWR(["today", tz], () => todayISO(tz), { refreshInterval: 60_000, revalidateOnFocus: true });
  return data ?? todayISO(tz);
}

export function useProfile() {
  const uid = useUserKey();
  return useSWR(uid ? ["profile", uid] : null, async () => {
    return unwrap(await getSupabase().from("profiles").select("*").maybeSingle()) as Profile | null;
  });
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
export function useCategories() {
  const uid = useUserKey();
  return useSWR(uid ? ["categories", uid] : null, async () => {
    return unwrap(
      await getSupabase().from("categories").select("*").order("kind", { ascending: false }).order("sort_order").order("name"),
    ) as Category[];
  });
}

export function usePaymentMethods() {
  const uid = useUserKey();
  return useSWR(uid ? ["payment_methods", uid] : null, async () => {
    return unwrap(await getSupabase().from("payment_methods").select("*").order("sort_order").order("name")) as PaymentMethod[];
  });
}

export function useRecurringRules() {
  const uid = useUserKey();
  return useSWR(uid ? ["recurring_rules", uid] : null, async () => {
    return unwrap(
      await getSupabase().from("recurring_rules").select("*").order("kind", { ascending: false }).order("name"),
    ) as RecurringRule[];
  });
}

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------
export interface MonthData {
  monthRows: ObligationStatusRow[];
  carried: ObligationStatusRow[];
  transactions: Transaction[];
  notes: string | null;
  budgetId: string;
}

export function useMonthData(period: string) {
  const uid = useUserKey();
  return useSWR<MonthData>(uid ? ["month", uid, period] : null, async () => {
    const supabase = getSupabase();
    const budgetId = unwrap(await supabase.rpc("ensure_month", { p_period: period })) as string;
    const [monthRows, older, transactions, budget] = await Promise.all([
      supabase.from("obligation_status").select("*").eq("period", period),
      supabase
        .from("obligation_status")
        .select("*")
        .lt("period", period)
        .gt("outstanding", 0)
        .eq("category_carry_forward", true),
      fetchAll<Transaction>((from, to) =>
        supabase
          .from("transactions")
          .select("*")
          .gte("txn_date", period)
          .lte("txn_date", lastDayOf(period))
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      supabase.from("monthly_budgets").select("notes").eq("id", budgetId).maybeSingle(),
    ]);
    const rows = unwrap(monthRows) as ObligationStatusRow[];
    return {
      monthRows: rows,
      carried: carriedRows(rows, unwrap(older) as ObligationStatusRow[]),
      transactions,
      notes: (unwrap(budget) as { notes: string | null } | null)?.notes ?? null,
      budgetId,
    };
  });
}

/** Month data with derived line items and the summary. */
export function useMonth(period: string) {
  const today = useToday();
  const swr = useMonthData(period);
  const derived = useMemo(() => {
    if (!swr.data) return null;
    const items = sortItems([
      ...swr.data.monthRows.map((r) => toLineItem(r, today)),
      ...swr.data.carried.map((r) => toLineItem(r, today, true)),
    ]);
    return { items, summary: summarizeMonth(items, swr.data.transactions) };
  }, [swr.data, today]);
  return { ...swr, items: derived?.items ?? null, summary: derived?.summary ?? null };
}

/** Every item still owing money, across all months (for reminders & overdue). */
export function useOpenItems() {
  const uid = useUserKey();
  const today = useToday();
  const swr = useSWR(uid ? ["open-items", uid] : null, async () => {
    const supabase = getSupabase();
    unwrap(await supabase.rpc("ensure_month", { p_period: toISODate(+today.slice(0, 4), +today.slice(5, 7), 1) }));
    return fetchAll<ObligationStatusRow>((from, to) =>
      supabase.from("obligation_status").select("*").gt("outstanding", 0).order("due_date").range(from, to),
    );
  });
  const items = useMemo(() => (swr.data ? swr.data.map((r) => toLineItem({ ...r, carried_in: 0 }, today)) : null), [swr.data, today]);
  return { ...swr, items };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export interface TransactionFilters {
  from: string;
  to: string;
  kind: TransactionKind | "all";
  categoryId: string | "all";
  paymentMethodId: string | "all";
  search: string;
}

export function useTransactions(f: TransactionFilters) {
  const uid = useUserKey();
  return useSWR(uid ? ["transactions", uid, f.from, f.to, f.kind, f.categoryId, f.paymentMethodId, f.search] : null, () =>
    fetchAll<Transaction>((from, to) => {
      let q = getSupabase()
        .from("transactions")
        .select("*")
        .gte("txn_date", f.from)
        .lte("txn_date", f.to)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (f.kind !== "all") q = q.eq("kind", f.kind);
      if (f.categoryId !== "all") q = q.eq("category_id", f.categoryId);
      if (f.paymentMethodId !== "all") q = q.eq("payment_method_id", f.paymentMethodId);
      const s = f.search.trim().replace(/[%_,()]/g, " ");
      if (s) q = q.or(`description.ilike.%${s}%,notes.ilike.%${s}%`);
      return q.range(from, to);
    }),
  );
}

export function useRecentTransactions(limit = 6) {
  const uid = useUserKey();
  return useSWR(uid ? ["recent", uid, limit] : null, async () => {
    return unwrap(
      await getSupabase()
        .from("transactions")
        .select("*")
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit),
    ) as Transaction[];
  });
}

/** Payment timeline for one item: its allocations and the transactions behind them. */
export function useObligationHistory(obligationId: string | null) {
  const uid = useUserKey();
  return useSWR(uid && obligationId ? ["history", uid, obligationId] : null, async () => {
    const supabase = getSupabase();
    const allocations = unwrap(
      await supabase.from("payment_allocations").select("*").eq("obligation_id", obligationId!),
    ) as PaymentAllocation[];
    const ids = [...new Set(allocations.map((a) => a.transaction_id))];
    const direct = unwrap(
      await supabase.from("transactions").select("*").eq("obligation_id", obligationId!),
    ) as Transaction[];
    const extra = ids.filter((id) => !direct.some((t) => t.id === id));
    const others = extra.length
      ? (unwrap(await supabase.from("transactions").select("*").in("id", extra)) as Transaction[])
      : [];
    const txns = [...direct, ...others];
    const linked = unwrap(
      await supabase
        .from("payment_allocations")
        .select("*")
        .in("transaction_id", txns.map((t) => t.id).length ? txns.map((t) => t.id) : ["00000000-0000-0000-0000-000000000000"]),
    ) as PaymentAllocation[];
    const obligationIds = [...new Set(linked.map((a) => a.obligation_id))];
    const related = obligationIds.length
      ? (unwrap(
          await supabase.from("obligations").select("id, name, period").in("id", obligationIds),
        ) as Array<{ id: string; name: string; period: string }>)
      : [];
    return {
      entries: txns
        .map((t) => ({
          transaction: t,
          allocatedHere: toMinor(allocations.find((a) => a.transaction_id === t.id)?.amount ?? 0),
          splits: linked
            .filter((a) => a.transaction_id === t.id)
            .map((a) => ({ ...a, obligation: related.find((o) => o.id === a.obligation_id) ?? null })),
          madeHere: t.obligation_id === obligationId,
        }))
        .sort((a, b) => b.transaction.txn_date.localeCompare(a.transaction.txn_date) || b.transaction.created_at.localeCompare(a.transaction.created_at)),
    };
  });
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
async function rangeData(fromPeriod: string, toPeriod: string) {
  const supabase = getSupabase();
  const [transactions, obligations] = await Promise.all([
    fetchAll<Transaction>((from, to) =>
      supabase
        .from("transactions")
        .select("*")
        .gte("txn_date", fromPeriod)
        .lte("txn_date", lastDayOf(toPeriod))
        .in("kind", ["income", "expense"])
        .range(from, to),
    ),
    fetchAll<ObligationBalance>((from, to) =>
      supabase.from("obligation_balances").select("*").gte("period", fromPeriod).lte("period", toPeriod).range(from, to),
    ),
  ]);
  return { transactions, obligations };
}

export function useYear(year: number) {
  const uid = useUserKey();
  const categories = useCategories();
  const currentPeriod = periodOf(useToday());
  const swr = useSWR(uid ? ["year", uid, year] : null, () => rangeData(toISODate(year, 1, 1), toISODate(year, 12, 1)));
  const analytics = useMemo(
    () =>
      swr.data && categories.data
        ? analyzeYear(year, swr.data.transactions, swr.data.obligations, categories.data, currentPeriod)
        : null,
    [swr.data, categories.data, year, currentPeriod],
  );
  return { ...swr, analytics };
}

/** Monthly cash-flow series for the `count` months ending at `endPeriod`. */
export function useSeries(endPeriod: string, count = 6) {
  const uid = useUserKey();
  const start = addMonths(endPeriod, -(count - 1));
  const swr = useSWR(uid ? ["series", uid, start, endPeriod] : null, () => rangeData(start, endPeriod));
  const points = useMemo<MonthPoint[] | null>(() => {
    if (!swr.data) return null;
    const points: MonthPoint[] = [];
    for (let i = 0; i < count; i++) {
      const p = addMonths(start, i);
      points.push({ period: p, month: +p.slice(5, 7), income: 0, expense: 0, savings: 0, budgetIncome: 0, budgetExpense: 0, hasData: false });
    }
    const idx = (iso: string) => points.findIndex((p) => p.period === iso.slice(0, 7) + "-01");
    for (const t of swr.data.transactions) {
      const i = idx(t.txn_date);
      if (i < 0) continue;
      if (t.kind === "income") points[i].income += toMinor(t.amount);
      else if (t.kind === "expense") points[i].expense += toMinor(t.amount);
      points[i].hasData = true;
    }
    for (const o of swr.data.obligations) {
      const i = idx(o.period);
      if (i < 0) continue;
      if (o.kind === "income") points[i].budgetIncome += toMinor(o.budget_amount);
      else points[i].budgetExpense += toMinor(o.budget_amount);
    }
    for (const p of points) p.savings = p.income - p.expense;
    return points;
  }, [swr.data, start, count]);
  return { ...swr, points };
}
