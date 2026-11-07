import { toISODate } from "../dates";
import { toMinor, type Minor } from "../money";
import type { Category, ObligationBalance, Transaction } from "../types";

export interface MonthPoint {
  period: string;
  month: number;
  income: Minor;
  expense: Minor;
  savings: Minor;
  budgetIncome: Minor;
  budgetExpense: Minor;
  hasData: boolean;
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  amount: Minor;
  share: number;
}

export interface BudgetComparison {
  categoryId: string;
  name: string;
  budget: Minor;
  actual: Minor;
  /** actual − budget; positive = overspent. */
  variance: Minor;
}

export interface YearAnalytics {
  year: number;
  months: MonthPoint[];
  incomeReceived: Minor;
  expensesPaid: Minor;
  savings: Minor;
  savingsRate: number;
  averageMonthlyExpense: Minor;
  highestMonth: MonthPoint | null;
  lowestMonth: MonthPoint | null;
  categorySpending: CategorySlice[];
  budgetVsActual: BudgetComparison[];
  budgetedExpenses: Minor;
}

export function analyzeYear(
  year: number,
  transactions: readonly Transaction[],
  obligations: readonly ObligationBalance[],
  categories: readonly Category[],
  /** Ignore budgets for months after this period (e.g. the current month). */
  throughPeriod?: string,
): YearAnalytics {
  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    period: toISODate(year, i + 1, 1),
    month: i + 1,
    income: 0,
    expense: 0,
    savings: 0,
    budgetIncome: 0,
    budgetExpense: 0,
    hasData: false,
  }));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const spend = new Map<string | null, Minor>();
  const actualByCat = new Map<string, Minor>();
  const budgetByCat = new Map<string, Minor>();

  for (const t of transactions) {
    const [y, m] = t.txn_date.split("-").map(Number);
    if (y !== year) continue;
    const point = months[m - 1];
    const amt = toMinor(t.amount);
    if (t.kind === "income") {
      point.income += amt;
      point.hasData = true;
    } else if (t.kind === "expense") {
      point.expense += amt;
      point.hasData = true;
      spend.set(t.category_id, (spend.get(t.category_id) ?? 0) + amt);
      if (t.category_id) actualByCat.set(t.category_id, (actualByCat.get(t.category_id) ?? 0) + amt);
    }
  }

  for (const o of obligations) {
    const [y, m] = o.period.split("-").map(Number);
    if (y !== year || (throughPeriod && o.period > throughPeriod)) continue;
    const point = months[m - 1];
    const b = toMinor(o.budget_amount);
    if (o.kind === "income") point.budgetIncome += b;
    else {
      point.budgetExpense += b;
      budgetByCat.set(o.category_id, (budgetByCat.get(o.category_id) ?? 0) + b);
    }
  }

  for (const p of months) p.savings = p.income - p.expense;

  const incomeReceived = months.reduce((s, p) => s + p.income, 0);
  const expensesPaid = months.reduce((s, p) => s + p.expense, 0);
  const spendingMonths = months.filter((p) => p.expense > 0);
  const sortedBySpend = [...spendingMonths].sort((a, b) => a.expense - b.expense);

  const totalSpend = [...spend.values()].reduce((s, v) => s + v, 0);
  const categorySpending: CategorySlice[] = [...spend.entries()]
    .map(([id, amount]) => ({
      categoryId: id,
      name: id ? (catName.get(id) ?? "Deleted category") : "Uncategorised",
      amount,
      share: totalSpend > 0 ? amount / totalSpend : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const ids = new Set([...budgetByCat.keys(), ...actualByCat.keys()]);
  const budgetVsActual: BudgetComparison[] = [...ids]
    .map((id) => {
      const budget = budgetByCat.get(id) ?? 0;
      const actual = actualByCat.get(id) ?? 0;
      return { categoryId: id, name: catName.get(id) ?? "Deleted category", budget, actual, variance: actual - budget };
    })
    .sort((a, b) => b.budget - a.budget || b.actual - a.actual);

  return {
    year,
    months,
    incomeReceived,
    expensesPaid,
    savings: incomeReceived - expensesPaid,
    savingsRate: incomeReceived > 0 ? (incomeReceived - expensesPaid) / incomeReceived : 0,
    averageMonthlyExpense: spendingMonths.length ? Math.round(expensesPaid / spendingMonths.length) : 0,
    highestMonth: sortedBySpend.at(-1) ?? null,
    lowestMonth: sortedBySpend[0] ?? null,
    categorySpending,
    budgetVsActual,
    budgetedExpenses: months.reduce((s, p) => s + p.budgetExpense, 0),
  };
}

/** Keep the largest `max − 1` slices and fold the rest into "Other". */
export function foldSlices(slices: readonly CategorySlice[], max = 8): CategorySlice[] {
  if (slices.length <= max) return [...slices];
  const head = slices.slice(0, max - 1);
  const rest = slices.slice(max - 1);
  const amount = rest.reduce((s, x) => s + x.amount, 0);
  const share = rest.reduce((s, x) => s + x.share, 0);
  return [...head, { categoryId: "__other", name: `Other (${rest.length})`, amount, share }];
}
