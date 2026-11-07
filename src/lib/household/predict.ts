import { addDays, daysBetween } from "../dates";
import type { Minor } from "../money";

export interface PurchasePoint {
  date: string; // YYYY-MM-DD
  qty: number;
  totalPrice: Minor | null;
  store?: string | null;
}

export type StockStatus = "learning" | "ok" | "soon" | "out";

export interface Prediction {
  status: StockStatus;
  /** Units consumed per day, when known. */
  dailyUse: number | null;
  /** How many days the usual quantity lasts. */
  daysPerUsualQty: number | null;
  runOutDate: string | null;
  daysLeft: number | null;
  /** Typical quantity bought (median of recent purchases). */
  suggestedQty: number | null;
  /** 0–1: how many completed consumption windows back the estimate. */
  confidence: number;
  lastPurchase: PurchasePoint | null;
}

/**
 * Learns consumption from history.
 *
 * Each purchase starts a "window" that ends at the first "running low" signal
 * after it (a shopping-list request) or, failing that, at the next purchase.
 * Quantity ÷ window length gives a usage rate; recent windows are pooled.
 * The last purchase is then projected forward with that rate.
 */
export function predictItem(
  purchases: readonly PurchasePoint[],
  lowSignals: readonly string[],
  today: string,
  leadDays = 3,
): Prediction {
  const list = [...purchases].sort((a, b) => a.date.localeCompare(b.date));
  const signals = [...lowSignals].map((s) => s.slice(0, 10)).sort();
  const last = list.at(-1) ?? null;
  const qtys = list.slice(-3).map((p) => p.qty).sort((a, b) => a - b);
  const suggestedQty = qtys.length ? qtys[Math.floor(qtys.length / 2)] : null;

  const windows: Array<{ qty: number; days: number }> = [];
  for (let i = 0; i < list.length - 1; i++) {
    const start = list[i].date;
    const next = list[i + 1].date;
    const low = signals.find((s) => s > start && s <= next);
    windows.push({ qty: list[i].qty, days: Math.max(1, daysBetween(start, low ?? next)) });
  }
  // a "running low" signal after the latest purchase completes that window too
  const lowAfterLast = last ? signals.find((s) => s > last.date) : undefined;
  if (last && lowAfterLast) windows.push({ qty: last.qty, days: Math.max(1, daysBetween(last.date, lowAfterLast)) });

  const recent = windows.slice(-4);
  const usedQty = recent.reduce((s, w) => s + w.qty, 0);
  const usedDays = recent.reduce((s, w) => s + w.days, 0);
  const dailyUse = usedDays > 0 && usedQty > 0 ? usedQty / usedDays : null;

  const base = { suggestedQty, lastPurchase: last, confidence: Math.min(1, recent.length / 3) };

  if (!last || !dailyUse) {
    return { ...base, status: "learning", dailyUse: null, daysPerUsualQty: null, runOutDate: null, daysLeft: null };
  }
  const daysPerUsualQty = suggestedQty ? suggestedQty / dailyUse : null;
  if (lowAfterLast) {
    return { ...base, status: "out", dailyUse, daysPerUsualQty, runOutDate: lowAfterLast, daysLeft: Math.min(0, daysBetween(today, lowAfterLast)) };
  }
  const runOutDate = addDays(last.date, Math.max(1, Math.round(last.qty / dailyUse)));
  const daysLeft = daysBetween(today, runOutDate);
  const status: StockStatus = daysLeft <= 0 ? "out" : daysLeft <= leadDays ? "soon" : "ok";
  return { ...base, status, dailyUse, daysPerUsualQty, runOutDate, daysLeft };
}

export interface PriceStats {
  lastUnitPrice: number | null; // minor units per unit
  averageUnitPrice: number | null;
  /** Last vs average of the earlier purchases (0.1 = 10% dearer). */
  change: number | null;
  cheapest: { unitPrice: number; store: string | null; date: string } | null;
  totalSpent: Minor;
}

export function priceStats(purchases: readonly PurchasePoint[]): PriceStats {
  const priced = [...purchases]
    .filter((p) => p.totalPrice !== null && p.qty > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ ...p, unit: (p.totalPrice as number) / p.qty }));
  const totalSpent = priced.reduce((s, p) => s + (p.totalPrice as number), 0);
  if (!priced.length) return { lastUnitPrice: null, averageUnitPrice: null, change: null, cheapest: null, totalSpent };
  const recent = priced.slice(-6);
  const last = recent.at(-1)!;
  const earlier = recent.slice(0, -1);
  const avgEarlier = earlier.length ? earlier.reduce((s, p) => s + p.unit, 0) / earlier.length : null;
  const cheapest = priced.reduce((best, p) => (p.unit < best.unit ? p : best));
  return {
    lastUnitPrice: Math.round(last.unit),
    averageUnitPrice: Math.round(recent.reduce((s, p) => s + p.unit, 0) / recent.length),
    change: avgEarlier ? (last.unit - avgEarlier) / avgEarlier : null,
    cheapest: { unitPrice: Math.round(cheapest.unit), store: cheapest.store ?? null, date: cheapest.date },
    totalSpent,
  };
}

/** "1.5 kg", "12 pcs" — trims needless decimals. */
export function formatQty(qty: number | string | null | undefined, unit?: string | null) {
  if (qty === null || qty === undefined || qty === "") return unit ?? "";
  const n = Number(qty);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${text} ${unit}` : text;
}

/** "about 2 weeks", "5 days" */
export function formatDuration(days: number | null) {
  if (days === null || !Number.isFinite(days)) return "—";
  const d = Math.round(days);
  if (d < 1) return "less than a day";
  if (d < 14) return `${d} day${d === 1 ? "" : "s"}`;
  if (d < 60) return `about ${Math.round(d / 7)} weeks`;
  return `about ${Math.round(d / 30)} months`;
}
