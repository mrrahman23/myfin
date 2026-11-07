import type { Numeric } from "./types";

/**
 * Money is handled in integer minor units (poisha / cents) on the client so
 * that sums never drift. The database stores NUMERIC(14,2).
 */
export type Minor = number;

export function toMinor(value: Numeric | null | undefined): Minor {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Minor units → decimal string suitable for a NUMERIC column. */
export function toDecimalString(minor: Minor): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parses user input such as "6,500", "৳ 6500.5" into minor units. */
export function parseAmount(input: string | number | null | undefined): Minor | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const cleaned = input.replace(/[^\d.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const CURRENCIES: Record<string, { symbol: string; label: string }> = {
  BDT: { symbol: "৳", label: "Bangladeshi Taka" },
  USD: { symbol: "$", label: "US Dollar" },
  EUR: { symbol: "€", label: "Euro" },
  GBP: { symbol: "£", label: "British Pound" },
  INR: { symbol: "₹", label: "Indian Rupee" },
  AED: { symbol: "د.إ", label: "UAE Dirham" },
  SAR: { symbol: "﷼", label: "Saudi Riyal" },
  SGD: { symbol: "S$", label: "Singapore Dollar" },
};

export function currencySymbol(code: string) {
  return CURRENCIES[code]?.symbol ?? code;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(decimals: number) {
  const key = String(decimals);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    fmtCache.set(key, f);
  }
  return f;
}

export interface FormatOptions {
  currency?: string;
  /** Show "+" for positive values. */
  signed?: boolean;
  /** Abbreviate large numbers (1.2L, 3.4Cr is avoided — we use K / M). */
  compact?: boolean;
  /** Omit the currency symbol. */
  bare?: boolean;
}

/** Formats minor units, e.g. 3500000 → "৳35,000". Decimals only when needed. */
export function formatMoney(minor: Minor, opts: FormatOptions = {}): string {
  const { currency = "BDT", signed = false, compact = false, bare = false } = opts;
  const negative = minor < 0;
  const abs = Math.abs(minor) / 100;
  let body: string;
  if (compact && abs >= 1000) {
    if (abs >= 1_000_000) body = `${trim(abs / 1_000_000)}M`;
    else body = `${trim(abs / 1000)}K`;
  } else {
    body = nf(Math.abs(minor) % 100 === 0 ? 0 : 2).format(abs);
  }
  const symbol = bare ? "" : currencySymbol(currency);
  const sign = negative ? "−" : signed && minor > 0 ? "+" : "";
  return `${sign}${symbol}${body}`;
}

function trim(n: number) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
}

export function sumMinor<T>(items: readonly T[], pick: (item: T) => Minor): Minor {
  let total = 0;
  for (const item of items) total += pick(item);
  return total;
}
