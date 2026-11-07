"use client";

import { Pill } from "@/components/ui/primitives";
import type { ItemView } from "@/lib/household/hooks";

export function StockPill({ view }: { view: ItemView }) {
  const p = view.prediction;
  if (view.openRequest) return <Pill tone="accent">On list</Pill>;
  if (p.status === "learning") return <Pill>Learning</Pill>;
  if (p.status === "out") return <Pill tone="negative">Running out</Pill>;
  if (p.status === "soon") return <Pill tone="warning">~{p.daysLeft}d left</Pill>;
  return <Pill tone="positive">~{p.daysLeft}d left</Pill>;
}

/** Fraction of the usual quantity estimated to remain (0–1), or null. */
export function stockLevel(view: ItemView): number | null {
  const p = view.prediction;
  if (p.daysLeft === null || !p.lastPurchase || !p.dailyUse) return null;
  const total = p.lastPurchase.qty / p.dailyUse;
  return total > 0 ? Math.max(0, Math.min(1, p.daysLeft / total)) : null;
}
