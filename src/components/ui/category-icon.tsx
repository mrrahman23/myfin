"use client";

import {
  Banknote, Briefcase, Bus, Car, CarFront, CircleDollarSign, Coffee, CreditCard, Flame, Gift, GraduationCap,
  HandHeart, Heart, House, Landmark, PiggyBank, Plane, Receipt, ShoppingBag, ShoppingCart, Smartphone,
  Stethoscope, TrendingUp, Tv, Utensils, Wifi, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { EntryKind } from "@/lib/types";

export const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase, bus: Bus, utensils: Utensils, home: House, car: Car, "car-front": CarFront, zap: Zap,
  flame: Flame, "graduation-cap": GraduationCap, "hand-heart": HandHeart, heart: Heart, coffee: Coffee,
  "piggy-bank": PiggyBank, "credit-card": CreditCard, landmark: Landmark, "trending-up": TrendingUp,
  banknote: Banknote, gift: Gift, plane: Plane, receipt: Receipt, "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart, smartphone: Smartphone, stethoscope: Stethoscope, tv: Tv, wifi: Wifi,
  wrench: Wrench, dollar: CircleDollarSign,
};
export const ICON_KEYS = Object.keys(ICONS);

export function CategoryIcon({
  icon,
  kind,
  className,
  size = "md",
}: {
  icon: string | null | undefined;
  kind: EntryKind | "transfer" | "adjustment";
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = (icon && ICONS[icon]) || (kind === "income" ? Banknote : Receipt);
  const tone =
    kind === "income"
      ? "bg-accent-soft text-income"
      : kind === "expense"
        ? "bg-[color-mix(in_oklab,var(--expense)_13%,transparent)] text-expense"
        : "bg-surface-3 text-ink-2";
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        size === "md" ? "h-10 w-10 rounded-[12px]" : "h-8 w-8 rounded-[10px]",
        tone,
        className,
      )}
      aria-hidden
    >
      <Icon className={size === "md" ? "h-[19px] w-[19px]" : "h-4 w-4"} strokeWidth={2} />
    </span>
  );
}
