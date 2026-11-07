"use client";

import { useEffect, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { addDays } from "../dates";
import { useSession } from "../data/app-context";
import { unwrap } from "../data/errors";
import { useToday } from "../data/hooks";
import { toMinor } from "../money";
import { getSupabase } from "../supabase/client";
import { predictItem, priceStats, type PriceStats, type Prediction, type PurchasePoint } from "./predict";
import type { Household, HouseholdItem, HouseholdMember, HouseholdPurchase, ShoppingRequest } from "./types";

/** The caller's household (if any) and its members. */
export function useHousehold() {
  const { user } = useSession();
  const swr = useSWR(user ? ["household", user.id] : null, async () => {
    const supabase = getSupabase();
    const members = unwrap(await supabase.from("household_members").select("*").order("created_at")) as HouseholdMember[];
    const me = members.find((m) => m.user_id === user!.id) ?? null;
    if (!me) return { household: null, members: [], me: null };
    const household = unwrap(await supabase.from("households").select("*").eq("id", me.household_id).maybeSingle()) as Household | null;
    return { household, members: members.filter((m) => m.household_id === me.household_id), me };
  });
  return {
    ...swr,
    household: swr.data?.household ?? null,
    members: swr.data?.members ?? [],
    me: swr.data?.me ?? null,
    isOwner: swr.data?.me?.role === "owner",
  };
}

export interface ItemView {
  item: HouseholdItem;
  purchases: HouseholdPurchase[];
  openRequest: ShoppingRequest | null;
  prediction: Prediction;
  price: PriceStats;
}

export function toPoints(purchases: readonly HouseholdPurchase[]): PurchasePoint[] {
  return purchases.map((p) => ({
    date: p.purchased_on,
    qty: Number(p.qty),
    totalPrice: p.total_price === null ? null : toMinor(p.total_price),
    store: p.store,
  }));
}

/** Items, list and purchase history, with predictions. Updates live via Realtime. */
export function useHouseholdData(householdId: string | null) {
  const today = useToday();
  const key = householdId ? ["household-data", householdId] : null;
  const swr = useSWR(key, async () => {
    const supabase = getSupabase();
    const since = addDays(today, -400);
    const [items, requests, purchases] = await Promise.all([
      supabase.from("household_items").select("*").eq("household_id", householdId!).order("name"),
      supabase
        .from("shopping_requests")
        .select("*")
        .eq("household_id", householdId!)
        .gte("requested_at", since)
        .order("requested_at", { ascending: false }),
      supabase
        .from("household_purchases")
        .select("*")
        .eq("household_id", householdId!)
        .gte("purchased_on", since)
        .order("purchased_on", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    return {
      items: unwrap(items) as HouseholdItem[],
      requests: unwrap(requests) as ShoppingRequest[],
      purchases: unwrap(purchases) as HouseholdPurchase[],
    };
  });

  // live updates when another member changes something
  useEffect(() => {
    if (!householdId) return;
    const supabase = getSupabase();
    const refresh = () => void mutate(["household-data", householdId]);
    const channel = supabase.channel(`household-${householdId}`);
    for (const table of ["shopping_requests", "household_items", "household_purchases"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` }, refresh);
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [householdId]);

  const views = useMemo<ItemView[] | null>(() => {
    if (!swr.data) return null;
    const { items, requests, purchases } = swr.data;
    return items.map((item) => {
      const own = purchases.filter((p) => p.item_id === item.id);
      const reqs = requests.filter((r) => r.item_id === item.id);
      const points = toPoints(own);
      return {
        item,
        purchases: own,
        openRequest: reqs.find((r) => r.status === "open") ?? null,
        prediction: predictItem(points, reqs.map((r) => r.requested_at), today),
        price: priceStats(points),
      };
    });
  }, [swr.data, today]);

  return { ...swr, views };
}
