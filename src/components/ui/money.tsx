"use client";

import { cn } from "@/lib/cn";
import { formatMoney, type FormatOptions, type Minor } from "@/lib/money";
import { useCurrency } from "@/lib/data/hooks";

/** Renders a minor-unit amount in the user's currency. */
export function Money({
  value,
  className,
  tone,
  ...opts
}: { value: Minor; className?: string; tone?: "auto" | "income" | "expense" } & FormatOptions) {
  const currency = useCurrency();
  const color =
    tone === "auto" ? (value < 0 ? "text-negative" : value > 0 ? "text-positive" : "") : tone === "income" ? "text-positive" : "";
  return <span className={cn("tabular", color, className)}>{formatMoney(value, { currency, ...opts })}</span>;
}
