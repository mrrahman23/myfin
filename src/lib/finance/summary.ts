import { daysBetween } from "../dates";
import { toMinor, type Minor } from "../money";
import type { EntryKind, ObligationState, ObligationStatusRow, Transaction } from "../types";

/** A row in the monthly budget list. */
export interface LineItem {
  id: string;
  row: ObligationStatusRow;
  kind: EntryKind;
  name: string;
  categoryId: string;
  categoryName: string;
  group: string | null;
  icon: string | null;
  period: string;
  budget: Minor;
  /** This month's charge: actual if set, otherwise budget. */
  charge: Minor;
  hasActual: boolean;
  /** charge − budget (positive = over budget for expenses). */
  variance: Minor;
  paid: Minor;
  /** Own outstanding (may be negative when overpaid). */
  ownOutstanding: Minor;
  carriedIn: Minor;
  /** What a one-tap "Paid" would settle now. Never negative. */
  totalDue: Minor;
  state: ObligationState;
  dueDate: string | null;
  overdue: boolean;
  daysUntilDue: number | null;
  /** True when this row represents an older month's unsettled balance. */
  isCarriedRow: boolean;
  lastPaidOn: string | null;
  paymentCount: number;
}

export function toLineItem(row: ObligationStatusRow, today: string, isCarriedRow = false): LineItem {
  const budget = toMinor(row.budget_amount);
  const charge = toMinor(row.amount_due);
  const paid = toMinor(row.paid_amount);
  const ownOutstanding = toMinor(row.outstanding);
  const carriedIn = toMinor(row.carried_in);
  const totalDue = Math.max(0, carriedIn + ownOutstanding);
  const state = itemState(paid, totalDue, carriedIn);
  const daysUntilDue = row.due_date ? daysBetween(today, row.due_date) : null;
  return {
    id: row.id,
    row,
    kind: row.kind,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    group: row.category_group,
    icon: row.category_icon,
    period: row.period,
    budget,
    charge,
    hasActual: row.actual_amount !== null && row.actual_amount !== undefined,
    variance: charge - budget,
    paid,
    ownOutstanding,
    carriedIn,
    totalDue,
    state,
    dueDate: row.due_date,
    overdue: totalDue > 0 && daysUntilDue !== null && daysUntilDue < 0,
    daysUntilDue,
    isCarriedRow,
    lastPaidOn: row.last_paid_on,
    paymentCount: row.payment_count,
  };
}

export function itemState(paid: Minor, totalDue: Minor, carriedIn: Minor = 0): ObligationState {
  if (totalDue <= 0) return "paid";
  if (paid > 0 || (carriedIn > 0 && totalDue < carriedIn)) return "partial";
  return "unpaid";
}

export const STATE_LABEL: Record<EntryKind, Record<ObligationState, string>> = {
  expense: { unpaid: "Unpaid", partial: "Partially Paid", paid: "Paid" },
  income: { unpaid: "Expected", partial: "Partially Received", paid: "Received" },
};

/**
 * Older unsettled items that should appear in `period` because their category
 * carries balances forward but has no item in this month to absorb them.
 *
 * For each category, the latest older item is the payment target; when it is
 * its month's carry anchor, the database already folds every earlier balance
 * into its `carried_in`, so those earlier rows are not shown separately.
 */
export function carriedRows(
  monthRows: readonly ObligationStatusRow[],
  olderOpen: readonly ObligationStatusRow[],
): ObligationStatusRow[] {
  const categoriesInMonth = new Set(monthRows.map((r) => r.category_id));
  const byCategory = new Map<string, ObligationStatusRow[]>();
  for (const r of olderOpen) {
    if (!r.category_carry_forward || categoriesInMonth.has(r.category_id)) continue;
    const list = byCategory.get(r.category_id) ?? [];
    list.push(r);
    byCategory.set(r.category_id, list);
  }
  const out: ObligationStatusRow[] = [];
  for (const list of byCategory.values()) {
    let rows = [...list].sort(
      (a, b) =>
        b.period.localeCompare(a.period) ||
        Number(b.is_carry_anchor) - Number(a.is_carry_anchor) ||
        (b.due_date ?? "").localeCompare(a.due_date ?? ""),
    );
    while (rows.length) {
      const target = rows[0];
      out.push(target);
      rows = rows.slice(1);
      if (target.is_carry_anchor) rows = rows.filter((r) => r.period >= target.period);
    }
  }
  return out;
}

export interface MonthTotals {
  /** Sum of budgets. */
  budget: Minor;
  /** Sum of this month's charges (actual or budget). */
  total: Minor;
  /** Cash moved in the month (by transaction date). */
  cash: Minor;
  /** Unsettled: this month's items + balances carried in. */
  outstanding: Minor;
  carriedIn: Minor;
  /** Budget variance for items with an actual amount. */
  variance: Minor;
}

export interface MonthSummary {
  income: MonthTotals;
  expense: MonthTotals;
  adjustments: Minor;
  transfers: Minor;
  /** Income received − expenses paid (+ adjustments). */
  available: Minor;
  savings: {
    budgeted: Minor;
    actual: Minor;
    projected: Minor;
  };
  progress: {
    incomePct: number;
    expensePct: number;
    itemsSettled: number;
    itemsTotal: number;
  };
  /** `overdue` counts expense items only (matches `overdueAmount`). */
  counts: { paid: number; partial: number; unpaid: number; overdue: number };
  overdueAmount: Minor;
}

const ratio = (part: Minor, whole: Minor) => (whole <= 0 ? (part > 0 ? 1 : 0) : Math.min(1, Math.max(0, part / whole)));

export function summarizeMonth(items: readonly LineItem[], monthTransactions: readonly Transaction[]): MonthSummary {
  const totals = (kind: EntryKind): MonthTotals => {
    const own = items.filter((i) => i.kind === kind && !i.isCarriedRow);
    const all = items.filter((i) => i.kind === kind);
    return {
      budget: own.reduce((s, i) => s + i.budget, 0),
      total: own.reduce((s, i) => s + i.charge, 0),
      cash: monthTransactions.filter((t) => t.kind === kind).reduce((s, t) => s + toMinor(t.amount), 0),
      outstanding: all.reduce((s, i) => s + i.totalDue, 0),
      carriedIn: all.reduce((s, i) => s + (i.isCarriedRow ? i.totalDue : Math.min(i.carriedIn, i.totalDue)), 0),
      variance: own.filter((i) => i.hasActual).reduce((s, i) => s + i.variance, 0),
    };
  };
  const income = totals("income");
  const expense = totals("expense");
  const adjustments = monthTransactions
    .filter((t) => t.kind === "adjustment")
    .reduce((s, t) => s + toMinor(t.amount), 0);
  const transfers = monthTransactions
    .filter((t) => t.kind === "transfer")
    .reduce((s, t) => s + toMinor(t.amount), 0);

  const counts = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };
  let overdueAmount = 0;
  for (const i of items) {
    counts[i.state] += 1;
    if (i.overdue && i.kind === "expense") {
      counts.overdue += 1;
      overdueAmount += i.totalDue;
    }
  }

  return {
    income,
    expense,
    adjustments,
    transfers,
    available: income.cash - expense.cash + adjustments,
    savings: {
      budgeted: income.budget - expense.budget,
      actual: income.cash - expense.cash,
      projected: income.cash + income.outstanding - (expense.cash + expense.outstanding),
    },
    progress: {
      incomePct: ratio(income.cash, income.cash + income.outstanding),
      expensePct: ratio(expense.cash, expense.cash + expense.outstanding),
      itemsSettled: counts.paid,
      itemsTotal: items.length,
    },
    counts,
    overdueAmount,
  };
}

/** Sort for display: unsettled first by due date, settled last. */
export function sortItems(items: readonly LineItem[]): LineItem[] {
  return [...items].sort((a, b) => {
    if ((a.state === "paid") !== (b.state === "paid")) return a.state === "paid" ? 1 : -1;
    const ad = a.dueDate ?? "9999";
    const bd = b.dueDate ?? "9999";
    return ad.localeCompare(bd) || a.name.localeCompare(b.name);
  });
}
