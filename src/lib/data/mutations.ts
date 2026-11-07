"use client";

import { mutate } from "swr";
import { toDecimalString, type Minor } from "../money";
import { getSupabase } from "../supabase/client";
import type {
  Category,
  EntryKind,
  PaymentMethod,
  PaymentMethodType,
  RecurringRule,
  Transaction,
  TransactionKind,
  UserSettings,
} from "../types";
import { unwrap } from "./errors";

/** Revalidate every cached query (all figures are derived server-side). */
export function refreshAll() {
  return mutate(() => true);
}

const dec = (m: Minor) => toDecimalString(m);
const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
/** One-tap: settles the item's full total due (including carried balances). */
export async function markPaid(obligationId: string, date?: string): Promise<string> {
  const id = unwrap(
    await getSupabase().rpc("record_payment", {
      p_obligation_id: obligationId,
      p_amount: null,
      p_txn_date: date ?? null,
      p_client_ref: uuid(),
    }),
  ) as string;
  return id;
}

export interface PaymentInput {
  obligationId: string;
  amount: Minor;
  date: string;
  paymentMethodId: string | null;
  notes: string;
  clientRef: string;
}

export async function recordPayment(p: PaymentInput): Promise<string> {
  return unwrap(
    await getSupabase().rpc("record_payment", {
      p_obligation_id: p.obligationId,
      p_amount: dec(p.amount),
      p_txn_date: p.date,
      p_payment_method_id: p.paymentMethodId,
      p_notes: p.notes || null,
      p_client_ref: p.clientRef,
    }),
  ) as string;
}

export async function unmarkObligation(obligationId: string): Promise<number> {
  return unwrap(await getSupabase().rpc("unmark_obligation", { p_obligation_id: obligationId })) as number;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export interface TransactionInput {
  kind: TransactionKind;
  amount: Minor;
  txn_date: string;
  category_id: string | null;
  payment_method_id: string | null;
  to_payment_method_id: string | null;
  obligation_id: string | null;
  description: string;
  notes: string;
}

export async function saveTransaction(input: TransactionInput, id?: string, clientRef?: string): Promise<Transaction> {
  const supabase = getSupabase();
  const row = {
    kind: input.kind,
    amount: dec(input.amount),
    txn_date: input.txn_date,
    category_id: input.category_id,
    payment_method_id: input.payment_method_id,
    to_payment_method_id: input.kind === "transfer" ? input.to_payment_method_id : null,
    obligation_id: input.kind === "income" || input.kind === "expense" ? input.obligation_id : null,
    description: input.description.trim() || null,
    notes: input.notes.trim() || null,
  };
  if (id) {
    return unwrap(await supabase.from("transactions").update(row).eq("id", id).select().single()) as Transaction;
  }
  const ref = clientRef ?? uuid();
  const res = await supabase.from("transactions").insert({ ...row, client_ref: ref }).select().single();
  if (res.error?.code === "23505") {
    // duplicate submit — return the row that already exists
    return unwrap(await supabase.from("transactions").select("*").eq("client_ref", ref).single()) as Transaction;
  }
  return unwrap(res) as Transaction;
}

export async function deleteTransaction(id: string) {
  unwrap(await getSupabase().from("transactions").delete().eq("id", id));
}

/** Re-creates a deleted transaction (used by Undo). */
export async function restoreTransaction(t: Transaction) {
  unwrap(
    await getSupabase()
      .from("transactions")
      .insert({
        kind: t.kind,
        amount: t.amount,
        txn_date: t.txn_date,
        category_id: t.category_id,
        payment_method_id: t.payment_method_id,
        to_payment_method_id: t.to_payment_method_id,
        obligation_id: t.obligation_id,
        description: t.description,
        notes: t.notes,
        client_ref: uuid(),
      }),
  );
}

// ---------------------------------------------------------------------------
// Obligations (monthly items)
// ---------------------------------------------------------------------------
export interface ObligationInput {
  period: string;
  category_id: string;
  kind: EntryKind;
  name: string;
  budget_amount: Minor;
  actual_amount: Minor | null;
  due_date: string | null;
  notes: string;
}

export async function createObligation(input: ObligationInput) {
  unwrap(
    await getSupabase()
      .from("obligations")
      .insert({
        ...input,
        name: input.name.trim(),
        budget_amount: dec(input.budget_amount),
        actual_amount: input.actual_amount === null ? null : dec(input.actual_amount),
        notes: input.notes.trim() || null,
      }),
  );
}

export async function updateObligation(
  id: string,
  patch: Partial<{ name: string; due_date: string | null; notes: string | null; actual_amount: Minor | null; category_id: string }>,
) {
  const row: Record<string, unknown> = { ...patch };
  if ("actual_amount" in patch) row.actual_amount = patch.actual_amount === null ? null : dec(patch.actual_amount!);
  if (typeof patch.name === "string") row.name = patch.name.trim();
  unwrap(await getSupabase().from("obligations").update(row).eq("id", id));
}

export async function updateBudget(id: string, budget: Minor, applyFuture: boolean) {
  unwrap(
    await getSupabase().rpc("update_obligation_budget", {
      p_obligation_id: id,
      p_budget: dec(budget),
      p_apply_future: applyFuture,
    }),
  );
}

export async function deleteObligation(id: string) {
  unwrap(await getSupabase().from("obligations").delete().eq("id", id));
}

export async function copyMonth(from: string, to: string): Promise<number> {
  return unwrap(await getSupabase().rpc("copy_month_budget", { p_from: from, p_to: to })) as number;
}

export async function saveMonthNotes(budgetId: string, notes: string) {
  unwrap(await getSupabase().from("monthly_budgets").update({ notes: notes.trim() || null }).eq("id", budgetId));
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export interface CategoryInput {
  kind: EntryKind;
  name: string;
  group_name: string;
  icon: string;
  default_budget: Minor;
  default_due_day: number | null;
  carry_forward: boolean;
}

export async function saveCategory(input: CategoryInput, id?: string, opts?: { createMonthlyRule?: boolean; startPeriod?: string }) {
  const supabase = getSupabase();
  const row = {
    ...input,
    name: input.name.trim(),
    group_name: input.group_name.trim() || null,
    default_budget: dec(input.default_budget),
  };
  if (id) {
    unwrap(await supabase.from("categories").update(row).eq("id", id));
    return;
  }
  const created = unwrap(await supabase.from("categories").insert(row).select().single()) as Category;
  if (opts?.createMonthlyRule && opts.startPeriod) {
    unwrap(
      await supabase.from("recurring_rules").insert({
        category_id: created.id,
        kind: created.kind,
        name: created.name,
        amount: row.default_budget,
        frequency: "monthly",
        day_of_month: input.default_due_day,
        start_date: opts.startPeriod,
      }),
    );
  }
}

export async function setCategoryArchived(id: string, archived: boolean) {
  unwrap(await getSupabase().from("categories").update({ is_archived: archived }).eq("id", id));
}

export async function deleteCategory(id: string) {
  unwrap(await getSupabase().from("categories").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------
export async function savePaymentMethod(input: { name: string; type: PaymentMethodType }, id?: string) {
  const supabase = getSupabase();
  const row = { name: input.name.trim(), type: input.type };
  if (id) unwrap(await supabase.from("payment_methods").update(row).eq("id", id));
  else unwrap(await supabase.from("payment_methods").insert(row));
}

export async function setDefaultPaymentMethod(id: string) {
  const supabase = getSupabase();
  unwrap(await supabase.from("payment_methods").update({ is_default: false }).eq("is_default", true));
  unwrap(await supabase.from("payment_methods").update({ is_default: true, is_archived: false }).eq("id", id));
}

export async function setPaymentMethodArchived(m: PaymentMethod, archived: boolean) {
  unwrap(
    await getSupabase()
      .from("payment_methods")
      .update({ is_archived: archived, is_default: archived ? false : m.is_default })
      .eq("id", m.id),
  );
}

export async function deletePaymentMethod(id: string) {
  unwrap(await getSupabase().from("payment_methods").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------
export type RecurringInput = Omit<RecurringRule, "id" | "user_id" | "created_at" | "updated_at" | "amount"> & {
  amount: Minor;
};

export async function saveRecurringRule(input: RecurringInput, id?: string) {
  const supabase = getSupabase();
  const row = { ...input, name: input.name.trim(), amount: dec(input.amount), notes: input.notes?.trim() || null };
  if (id) unwrap(await supabase.from("recurring_rules").update(row).eq("id", id));
  else unwrap(await supabase.from("recurring_rules").insert(row));
}

export async function deleteRecurringRule(id: string) {
  unwrap(await getSupabase().from("recurring_rules").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Settings & profile
// ---------------------------------------------------------------------------
export async function updateSettings(patch: Partial<Omit<UserSettings, "user_id" | "created_at" | "updated_at">>) {
  unwrap(await getSupabase().from("user_settings").update(patch).not("user_id", "is", null));
}

export async function updateProfile(userId: string, fullName: string) {
  unwrap(await getSupabase().from("profiles").upsert({ id: userId, full_name: fullName.trim() || null }));
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------
const BACKUP_TABLES = [
  "profiles",
  "user_settings",
  "categories",
  "payment_methods",
  "recurring_rules",
  "monthly_budgets",
  "obligations",
  "transactions",
  "payment_allocations",
] as const;

export async function buildBackup() {
  const supabase = getSupabase();
  const out: Record<string, unknown> = { app: "myfin", version: 1, exported_at: new Date().toISOString() };
  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const page = unwrap(await supabase.from(table).select("*").range(from, from + 999)) as unknown[];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    out[table] = rows;
  }
  return out;
}

export async function restoreBackup(data: unknown): Promise<Record<string, number>> {
  return unwrap(await getSupabase().rpc("restore_backup", { p_data: data })) as Record<string, number>;
}

// ---------------------------------------------------------------------------
// Push (for future native / Web Push delivery)
// ---------------------------------------------------------------------------
export async function savePushSubscription(input: {
  platform: "web" | "ios" | "android";
  endpoint: string;
  p256dh?: string;
  auth_secret?: string;
}) {
  unwrap(
    await getSupabase()
      .from("push_subscriptions")
      .upsert({ ...input, user_agent: navigator.userAgent.slice(0, 300) }, { onConflict: "user_id,endpoint" }),
  );
}
