export type EntryKind = "income" | "expense";
export type TransactionKind = "income" | "expense" | "transfer" | "adjustment";
export type RecurrenceFrequency = "monthly" | "weekly" | "yearly" | "custom";
export type RecurrenceUnit = "day" | "week" | "month";
export type PaymentMethodType = "cash" | "bank" | "card" | "mobile" | "other";
export type ThemePreference = "system" | "light" | "dark";

/** NUMERIC columns arrive from PostgREST as numbers or strings. */
export type Numeric = number | string;

export interface Profile {
  id: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  currency: string;
  timezone: string;
  theme: ThemePreference;
  notifications_enabled: boolean;
  notify_overdue: boolean;
  reminder_days_before: number;
  finance_enabled: boolean;
  notify_household_requests: boolean;
  notify_household_purchases: boolean;
  notify_household_predictions: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  kind: EntryKind;
  name: string;
  group_name: string | null;
  icon: string | null;
  default_budget: Numeric;
  default_due_day: number | null;
  carry_forward: boolean;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  name: string;
  type: PaymentMethodType;
  is_default: boolean;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  category_id: string;
  kind: EntryKind;
  name: string;
  amount: Numeric;
  frequency: RecurrenceFrequency;
  interval_count: number;
  interval_unit: RecurrenceUnit | null;
  day_of_month: number | null;
  weekday: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Obligation {
  id: string;
  user_id: string;
  monthly_budget_id: string;
  period: string;
  category_id: string;
  recurring_rule_id: string | null;
  kind: EntryKind;
  name: string;
  budget_amount: Numeric;
  actual_amount: Numeric | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Row of the `obligation_balances` view. */
export interface ObligationBalance extends Obligation {
  amount_due: Numeric;
  paid_amount: Numeric;
  outstanding: Numeric;
  last_paid_on: string | null;
  payment_count: number;
}

/** Row of the `obligation_status` view. */
export interface ObligationStatusRow extends ObligationBalance {
  category_name: string;
  category_group: string | null;
  category_icon: string | null;
  category_carry_forward: boolean;
  is_carry_anchor: boolean;
  carried_in: Numeric;
}

export interface Transaction {
  id: string;
  user_id: string;
  kind: TransactionKind;
  amount: Numeric;
  txn_date: string;
  category_id: string | null;
  payment_method_id: string | null;
  to_payment_method_id: string | null;
  obligation_id: string | null;
  description: string | null;
  notes: string | null;
  client_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  id: string;
  user_id: string;
  transaction_id: string;
  obligation_id: string;
  amount: Numeric;
  created_at: string;
}

export interface MonthlyBudget {
  id: string;
  user_id: string;
  period: string;
  notes: string | null;
}

export type ObligationState = "unpaid" | "partial" | "paid";
