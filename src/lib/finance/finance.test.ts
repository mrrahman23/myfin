import { describe, expect, it } from "vitest";
import { addMonths, dateInPeriod, daysBetween, periodOf, relativeDue, todayISO } from "../dates";
import { formatMoney, parseAmount, toDecimalString, toMinor } from "../money";
import type { ObligationStatusRow, Transaction } from "../types";
import { analyzeYear, foldSlices } from "./analytics";
import { carriedRows, itemState, summarizeMonth, toLineItem } from "./summary";

function row(p: Partial<ObligationStatusRow>): ObligationStatusRow {
  return {
    id: crypto.randomUUID(),
    user_id: "u",
    monthly_budget_id: "b",
    period: "2026-11-01",
    category_id: "c-" + (p.name ?? "x"),
    recurring_rule_id: null,
    kind: "expense",
    name: "Item",
    budget_amount: 0,
    actual_amount: null,
    due_date: null,
    notes: null,
    created_at: "",
    updated_at: "",
    amount_due: p.budget_amount ?? 0,
    paid_amount: 0,
    outstanding: p.budget_amount ?? 0,
    last_paid_on: null,
    payment_count: 0,
    category_name: p.name ?? "Item",
    category_group: null,
    category_icon: null,
    category_carry_forward: true,
    is_carry_anchor: true,
    carried_in: 0,
    ...p,
  };
}

function txn(kind: Transaction["kind"], amount: number, date = "2026-11-10", category_id: string | null = null): Transaction {
  return {
    id: crypto.randomUUID(),
    user_id: "u",
    kind,
    amount,
    txn_date: date,
    category_id,
    payment_method_id: null,
    to_payment_method_id: null,
    obligation_id: null,
    description: null,
    notes: null,
    client_ref: null,
    created_at: "",
    updated_at: "",
  };
}

describe("money", () => {
  it("avoids floating point drift", () => {
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
    expect(toMinor("6500.55")).toBe(650055);
    expect(toDecimalString(650055)).toBe("6500.55");
    expect(toDecimalString(-5)).toBe("-0.05");
  });
  it("parses user input", () => {
    expect(parseAmount("৳ 6,500")).toBe(650000);
    expect(parseAmount("12.5")).toBe(1250);
    expect(parseAmount("12.555")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
  it("formats BDT", () => {
    expect(formatMoney(3500000)).toBe("৳35,000");
    expect(formatMoney(-200050)).toBe("−৳2,000.50");
    expect(formatMoney(28000000, { compact: true })).toBe("৳280K");
    expect(formatMoney(100, { signed: true })).toBe("+৳1");
  });
});

describe("dates", () => {
  it("uses the Asia/Dhaka calendar day", () => {
    // 2026-11-30 20:00 UTC is already 1 December in Dhaka (UTC+6)
    expect(todayISO("Asia/Dhaka", new Date("2026-11-30T20:00:00Z"))).toBe("2026-12-01");
    expect(todayISO("UTC", new Date("2026-11-30T20:00:00Z"))).toBe("2026-11-30");
  });
  it("does month arithmetic", () => {
    expect(addMonths("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(periodOf("2026-11-17")).toBe("2026-11-01");
    expect(dateInPeriod("2026-02-01", 31)).toBe("2026-02-28");
    expect(daysBetween("2026-11-07", "2026-11-10")).toBe(3);
    expect(relativeDue("2026-11-05", "2026-11-07")).toBe("2 days overdue");
  });
});

describe("line items", () => {
  it("derives status, variance and total due", () => {
    const li = toLineItem(
      row({ budget_amount: 6000, actual_amount: 6500, amount_due: 6500, paid_amount: 0, outstanding: 6500, carried_in: 2000 }),
      "2026-11-07",
    );
    expect(li.variance).toBe(50000);
    expect(li.totalDue).toBe(850000);
    expect(li.state).toBe("unpaid");
  });
  it("partially paid and paid states", () => {
    expect(itemState(3000000, 2000000)).toBe("partial");
    expect(itemState(5000000, 0)).toBe("paid");
    expect(itemState(0, 100)).toBe("unpaid");
  });
  it("flags overdue only when something is owed", () => {
    expect(toLineItem(row({ budget_amount: 10, due_date: "2026-11-01" }), "2026-11-07").overdue).toBe(true);
    expect(
      toLineItem(row({ budget_amount: 10, outstanding: 0, paid_amount: 10, due_date: "2026-11-01" }), "2026-11-07").overdue,
    ).toBe(false);
  });
});

describe("carried rows", () => {
  it("shows a single carried row per category, folding earlier anchors", () => {
    const sep = row({ name: "Loan", category_id: "loan", period: "2026-09-01", outstanding: 1000 });
    const oct = row({ name: "Loan", category_id: "loan", period: "2026-10-01", outstanding: 500, carried_in: 1000 });
    const rows = carriedRows([], [sep, oct]);
    expect(rows.map((r) => r.id)).toEqual([oct.id]);
  });
  it("skips categories that already have an item this month or do not carry", () => {
    const old = row({ name: "Rent", category_id: "rent", period: "2026-10-01", outstanding: 1000 });
    const noCarry = row({ name: "Food", category_id: "food", period: "2026-10-01", outstanding: 1000, category_carry_forward: false });
    const now = row({ name: "Rent", category_id: "rent" });
    expect(carriedRows([now], [old, noCarry])).toEqual([]);
  });
});

describe("month summary", () => {
  const today = "2026-11-07";
  const items = [
    toLineItem(row({ kind: "income", name: "Salary", budget_amount: 280000, paid_amount: 280000, outstanding: 0 }), today),
    toLineItem(row({ kind: "income", name: "Shuttle", budget_amount: 100000 }), today),
    toLineItem(row({ name: "Rent", budget_amount: 35000, paid_amount: 35000, outstanding: 0 }), today),
    toLineItem(row({ name: "Loan", budget_amount: 50000, paid_amount: 30000, outstanding: 20000, due_date: "2026-11-01" }), today),
    toLineItem(
      row({ name: "Electricity", budget_amount: 6000, actual_amount: 6500, amount_due: 6500, outstanding: 6500, carried_in: 2000 }),
      today,
    ),
  ];
  const txns = [txn("income", 280000), txn("expense", 35000), txn("expense", 30000), txn("expense", 1200), txn("adjustment", -200)];
  const s = summarizeMonth(items, txns);

  it("computes the five headline questions", () => {
    expect(s.income.cash).toBe(28000000); // came in
    expect(s.expense.cash).toBe(6620000); // went out (includes unbudgeted 1,200)
    expect(s.available).toBe(28000000 - 6620000 - 20000); // available
    expect(s.expense.outstanding).toBe(2000000 + 850000); // still pending (incl. carry)
    expect(s.savings.actual).toBe(28000000 - 6620000); // saving
  });
  it("separates budget, charges and carried amounts", () => {
    expect(s.income.budget).toBe(38000000);
    expect(s.expense.budget).toBe(9100000);
    expect(s.expense.total).toBe(9150000);
    expect(s.expense.carriedIn).toBe(200000);
    expect(s.expense.variance).toBe(50000);
    expect(s.income.outstanding).toBe(10000000);
    expect(s.counts).toMatchObject({ paid: 2, partial: 1, unpaid: 2, overdue: 1 });
    expect(summarizeMonth([toLineItem(row({ kind: "income", budget_amount: 5, due_date: "2026-11-01" }), today)], []).counts.overdue).toBe(0);
    expect(s.overdueAmount).toBe(2000000);
    expect(s.savings.budgeted).toBe(38000000 - 9100000);
  });
});

describe("year analytics", () => {
  it("aggregates by month and category", () => {
    const txns = [
      txn("income", 100, "2026-01-05"),
      txn("expense", 40, "2026-01-06", "rent"),
      txn("expense", 70, "2026-03-06", "rent"),
      txn("expense", 10, "2026-03-07", "food"),
      txn("expense", 999, "2025-12-31", "rent"),
      txn("transfer", 500, "2026-02-01"),
    ];
    const obligations = [
      { ...row({ name: "Rent", category_id: "rent", period: "2026-01-01", budget_amount: 50 }) },
      { ...row({ name: "Rent", category_id: "rent", period: "2026-03-01", budget_amount: 50 }) },
    ];
    const cats = [
      { id: "rent", name: "Rent" },
      { id: "food", name: "Food" },
    ] as never;
    const a = analyzeYear(2026, txns, obligations, cats);
    expect(analyzeYear(2026, txns, obligations, cats, "2026-02-01").budgetedExpenses).toBe(5000);
    expect(a.incomeReceived).toBe(10000);
    expect(a.expensesPaid).toBe(12000);
    expect(a.highestMonth?.month).toBe(3);
    expect(a.lowestMonth?.month).toBe(1);
    expect(a.averageMonthlyExpense).toBe(6000);
    expect(a.categorySpending[0]).toMatchObject({ name: "Rent", amount: 11000 });
    expect(a.budgetVsActual.find((b) => b.categoryId === "rent")).toMatchObject({ budget: 10000, actual: 11000, variance: 1000 });
  });
  it("folds small slices into Other", () => {
    const slices = Array.from({ length: 10 }, (_, i) => ({ categoryId: String(i), name: String(i), amount: 10 - i, share: 0.1 }));
    const f = foldSlices(slices, 8);
    expect(f).toHaveLength(8);
    expect(f[7].name).toBe("Other (3)");
    expect(f[7].amount).toBe(3 + 2 + 1);
  });
});
