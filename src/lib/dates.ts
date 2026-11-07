/**
 * Calendar helpers that work on plain ISO date strings ("YYYY-MM-DD") so the
 * user's timezone — not the device's — decides what "today" is.
 */

export const DEFAULT_TIMEZONE = "Asia/Dhaka";

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d: d || 1 };
}

/** Today's date in the given IANA timezone. */
export function todayISO(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** First day of the month containing `iso`. */
export function periodOf(iso: string): string {
  const { y, m } = parseISO(iso);
  return toISODate(y, m, 1);
}

export function addMonths(period: string, delta: number): string {
  const { y, m } = parseISO(period);
  const idx = y * 12 + (m - 1) + delta;
  return toISODate(Math.floor(idx / 12), (idx % 12) + 1, 1);
}

export function daysInMonth(period: string): number {
  const { y, m } = parseISO(period);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function lastDayOf(period: string): string {
  const { y, m } = parseISO(period);
  return toISODate(y, m, daysInMonth(period));
}

/** Day `day` of the period's month, clamped to the month length. */
export function dateInPeriod(period: string, day: number): string {
  const { y, m } = parseISO(period);
  return toISODate(y, m, Math.min(Math.max(1, day), daysInMonth(period)));
}

export function addDays(iso: string, delta: number): string {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000,
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTH_NAMES = MONTHS;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function monthLabel(period: string, style: "long" | "short" = "long"): string {
  const { y, m } = parseISO(period);
  const name = MONTHS[m - 1];
  return style === "long" ? `${name} ${y}` : `${name.slice(0, 3)} ${y}`;
}

export function monthShort(period: string): string {
  return MONTHS[parseISO(period).m - 1].slice(0, 3);
}

/** "7 Nov" or "7 Nov 2025" when not in `referenceYear`. */
export function formatDate(iso: string | null | undefined, referenceYear?: number): string {
  if (!iso) return "—";
  const { y, m, d } = parseISO(iso);
  const base = `${d} ${MONTHS[m - 1].slice(0, 3)}`;
  return referenceYear !== undefined && referenceYear === y ? base : `${base} ${y}`;
}

export function weekdayOf(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Human description of a due date relative to today. */
export function relativeDue(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff > 1) return `Due in ${diff} days`;
  if (diff === -1) return "1 day overdue";
  return `${-diff} days overdue`;
}

export function yearOf(iso: string) {
  return parseISO(iso).y;
}

export function isValidISODate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseISO(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "just now", "5m ago", "3h ago", "2d ago" for timestamps. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const normalised = (iso.includes("T") || iso.includes(" ") ? iso.replace(" ", "T") : `${iso}T00:00:00`).replace(/([+-]\d{2})$/, "$1:00");
  const t = new Date(normalised).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (86400 * 30))}mo ago`;
}
