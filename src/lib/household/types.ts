import type { Numeric } from "../types";

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  display_name: string;
  created_at: string;
}

export interface HouseholdItem {
  id: string;
  household_id: string;
  name: string;
  category: string | null;
  unit: string;
  default_qty: Numeric | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ShoppingRequest {
  id: string;
  household_id: string;
  item_id: string;
  qty: Numeric | null;
  urgency: "normal" | "urgent";
  note: string | null;
  status: "open" | "bought" | "cancelled";
  requested_by: string | null;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  purchase_id: string | null;
}

export interface HouseholdPurchase {
  id: string;
  household_id: string;
  item_id: string;
  qty: Numeric;
  total_price: Numeric | null;
  purchased_on: string;
  store: string | null;
  notes: string | null;
  purchased_by: string | null;
  transaction_id: string | null;
  created_at: string;
}

export const UNITS = ["kg", "g", "L", "ml", "pcs", "dozen", "pack", "bottle", "box", "bag"] as const;

export const ITEM_CATEGORIES = [
  "Grains & Flour",
  "Oil & Ghee",
  "Lentils & Pulses",
  "Vegetables",
  "Fruits",
  "Fish & Meat",
  "Dairy & Eggs",
  "Spices",
  "Beverages",
  "Snacks",
  "Cleaning",
  "Personal care",
  "Baby",
  "Other",
] as const;

/** Common items for quick entry (name → unit, category). */
export const COMMON_ITEMS: ReadonlyArray<readonly [string, string, string]> = [
  ["Rice", "kg", "Grains & Flour"],
  ["Atta", "kg", "Grains & Flour"],
  ["Soybean Oil", "L", "Oil & Ghee"],
  ["Mustard Oil", "L", "Oil & Ghee"],
  ["Sugar", "kg", "Grains & Flour"],
  ["Salt", "kg", "Spices"],
  ["Masoor Dal", "kg", "Lentils & Pulses"],
  ["Onion", "kg", "Vegetables"],
  ["Potato", "kg", "Vegetables"],
  ["Garlic", "kg", "Vegetables"],
  ["Ginger", "kg", "Vegetables"],
  ["Eggs", "dozen", "Dairy & Eggs"],
  ["Milk", "L", "Dairy & Eggs"],
  ["Tea", "pack", "Beverages"],
  ["Chicken", "kg", "Fish & Meat"],
  ["Fish", "kg", "Fish & Meat"],
  ["Turmeric", "pack", "Spices"],
  ["Chilli Powder", "pack", "Spices"],
  ["Detergent", "pack", "Cleaning"],
  ["Dishwashing Liquid", "bottle", "Cleaning"],
  ["Toothpaste", "pcs", "Personal care"],
  ["Soap", "pcs", "Personal care"],
  ["Shampoo", "bottle", "Personal care"],
  ["Tissue", "pack", "Personal care"],
];
