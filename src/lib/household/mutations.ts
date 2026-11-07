"use client";

import { AppError, unwrap } from "../data/errors";
import { refreshAll } from "../data/mutations";
import { toDecimalString, type Minor } from "../money";
import { notifyHousehold } from "../push-client";
import { getSupabase } from "../supabase/client";

export async function createHousehold(name: string, displayName: string) {
  unwrap(await getSupabase().rpc("create_household", { p_name: name, p_display_name: displayName }));
  await refreshAll();
}

export interface RequestInput {
  itemId?: string | null;
  name?: string;
  unit?: string;
  category?: string;
  qty?: number | null;
  urgency: "normal" | "urgent";
  note?: string;
}

/** Adds to the shared list (or updates the open request) and notifies the others. */
export async function requestItem(input: RequestInput): Promise<string> {
  const id = unwrap(
    await getSupabase().rpc("request_household_item", {
      p_item_id: input.itemId ?? null,
      p_name: input.name ?? null,
      p_unit: input.unit ?? null,
      p_category: input.category ?? null,
      p_qty: input.qty ?? null,
      p_urgency: input.urgency,
      p_note: input.note?.trim() || null,
    }),
  ) as string;
  notifyHousehold("request", id);
  await refreshAll();
  return id;
}

export async function updateRequest(id: string, patch: { qty?: number | null; urgency?: "normal" | "urgent"; note?: string | null }) {
  unwrap(await getSupabase().from("shopping_requests").update(patch).eq("id", id));
  await refreshAll();
}

export async function cancelRequest(id: string, userId: string) {
  unwrap(
    await getSupabase()
      .from("shopping_requests")
      .update({ status: "cancelled", resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", id),
  );
  await refreshAll();
}

export interface PurchaseInput {
  itemId: string;
  qty: number;
  totalPrice: Minor | null;
  date: string;
  store: string;
  addExpense: boolean;
  categoryId: string | null;
  paymentMethodId: string | null;
  clientRef: string;
}

export async function recordPurchase(p: PurchaseInput): Promise<string> {
  const id = unwrap(
    await getSupabase().rpc("record_household_purchase", {
      p_item_id: p.itemId,
      p_qty: p.qty,
      p_total_price: p.totalPrice === null ? null : toDecimalString(p.totalPrice),
      p_purchased_on: p.date,
      p_store: p.store.trim() || null,
      p_add_expense: p.addExpense,
      p_category_id: p.categoryId,
      p_payment_method_id: p.paymentMethodId,
      p_client_ref: p.clientRef,
    }),
  ) as string;
  notifyHousehold("purchase", id);
  await refreshAll();
  return id;
}

export async function deletePurchase(id: string) {
  unwrap(await getSupabase().from("household_purchases").delete().eq("id", id));
  await refreshAll();
}

export async function updateItem(id: string, patch: { name?: string; unit?: string; category?: string | null; is_archived?: boolean }) {
  unwrap(await getSupabase().from("household_items").update(patch).eq("id", id));
  await refreshAll();
}

export async function renameHousehold(id: string, name: string) {
  unwrap(await getSupabase().from("households").update({ name: name.trim() }).eq("id", id));
  await refreshAll();
}

export async function updateDisplayName(householdId: string, userId: string, name: string) {
  unwrap(
    await getSupabase().from("household_members").update({ display_name: name.trim() }).eq("household_id", householdId).eq("user_id", userId),
  );
  await refreshAll();
}

export async function removeMember(householdId: string, userId: string) {
  unwrap(await getSupabase().from("household_members").delete().eq("household_id", householdId).eq("user_id", userId));
  await refreshAll();
}

export async function inviteMember(input: { name: string; email: string; password: string }): Promise<{ created: boolean }> {
  const res = await fetch("/api/household/invite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as { created?: boolean; error?: string };
  if (!res.ok) throw new AppError(json.error ?? "Could not add the member");
  await refreshAll();
  return { created: Boolean(json.created) };
}
