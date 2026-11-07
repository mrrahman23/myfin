"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Plus,
  Settings2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { TransactionSheet, type TransactionPreset } from "@/components/transactions/transaction-sheet";
import { Sheet } from "@/components/ui/sheet";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { addMonths, monthLabel, periodOf } from "@/lib/dates";
import { AppProviders, usePeriod, useSession } from "@/lib/data/app-context";
import { useOpenItems, useSettings, useToday } from "@/lib/data/hooks";
import { useReminderNotifications } from "@/lib/notifications";
import type { Transaction } from "@/lib/types";

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: ChartPie },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

// ---------------------------------------------------------------------------
// Quick add context — any page can open the transaction sheet
// ---------------------------------------------------------------------------
interface QuickAddApi {
  openNew: (preset?: TransactionPreset) => void;
  openEdit: (t: Transaction) => void;
}
const QuickAddContext = createContext<QuickAddApi | null>(null);
export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used inside AppShell");
  return ctx;
}

const noopSubscribe = () => () => {};

/** The signed-in app renders on the client only (data lives behind RLS in the browser session). */
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!hydrated) return <FullScreenSpinner />;
  return (
    <AppProviders>
      <ToastProvider>
        <ShellInner>{children}</ShellInner>
      </ToastProvider>
    </AppProviders>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { ready, user } = useSession();
  const [sheet, setSheet] = useState<{ open: boolean; preset?: TransactionPreset; transaction?: Transaction | null }>({
    open: false,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const api = useMemo<QuickAddApi>(
    () => ({
      openNew: (preset) => setSheet({ open: true, preset, transaction: null }),
      openEdit: (transaction) => setSheet({ open: true, transaction }),
    }),
    [],
  );
  useSettings(); // loads & applies theme
  useReminderNotifications();
  useServiceWorker();

  // deep link: /transactions?new=expense (manifest shortcut)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get("new");
    if (k === "expense" || k === "income") {
      api.openNew({ kind: k });
      params.delete("new");
      window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : ""));
    }
  }, [api]);

  if (!ready || !user) return <FullScreenSpinner />;

  return (
    <QuickAddContext.Provider value={api}>
      <div className="min-h-dvh lg:pl-[248px]">
        <Sidebar onAdd={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-[calc(env(safe-area-inset-bottom)+108px)] pt-[max(env(safe-area-inset-top),12px)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </main>
        <BottomNav onAdd={() => setMenuOpen(true)} />
      </div>

      <QuickAddMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onPick={(kind) => {
          setMenuOpen(false);
          api.openNew({ kind });
        }}
      />
      <TransactionSheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        transaction={sheet.transaction}
        preset={sheet.preset}
      />
    </QuickAddContext.Provider>
  );
}

function FullScreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-accent" role="status" aria-label="Loading" />
    </div>
  );
}

function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function Sidebar({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const { items } = useOpenItems();
  const today = useToday();
  const overdue = items?.filter((i) => i.overdue).length ?? 0;
  const dueSoon = items?.filter((i) => i.daysUntilDue !== null && i.daysUntilDue >= 0 && i.daysUntilDue <= 3).length ?? 0;
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-[9px]" />
        <span className="text-[19px] font-semibold tracking-[-0.03em]">myFin</span>
      </Link>
      <button
        type="button"
        onClick={onAdd}
        className="mb-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-semibold text-inverse transition hover:opacity-90 active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.6} /> Quick add
      </button>
      <nav className="space-y-1" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition",
                active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-3/60 hover:text-ink",
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
        <Link
          href="/reminders"
          aria-current={isActive(pathname, "/reminders") ? "page" : undefined}
          className={cn(
            "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition",
            isActive(pathname, "/reminders") ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-3/60 hover:text-ink",
          )}
        >
          <Bell className="h-[18px] w-[18px]" />
          Reminders
          {overdue + dueSoon > 0 ? (
            <span
              className={cn(
                "ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold text-white",
                overdue ? "bg-negative" : "bg-accent",
              )}
            >
              {overdue + dueSoon}
            </span>
          ) : null}
        </Link>
      </nav>
      <div className="mt-auto px-3 text-[12px] text-ink-3">Today · {today}</div>
    </aside>
  );
}

/** Hides the floating button while scrolling down so it never covers amounts. */
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const nearBottom = window.innerHeight + y >= document.documentElement.scrollHeight - 24;
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 80 && !nearBottom);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

function BottomNav({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const fabHidden = useHideOnScroll();
  return (
    <>
      <button
        type="button"
        onClick={onAdd}
        aria-label="Quick add"
        className={cn(
          "fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-[max(1rem,env(safe-area-inset-right))] z-40 grid h-14 w-14 place-items-center rounded-full bg-ink text-inverse shadow-float transition-[transform,opacity] duration-300 active:scale-90 lg:hidden",
          fabHidden && "pointer-events-none translate-y-24 opacity-0",
        )}
      >
        <Plus className="h-6 w-6" strokeWidth={2.6} />
      </button>
      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-[env(safe-area-inset-bottom)] pl-safe pr-safe lg:hidden"
      >
        <div className="mx-auto grid h-[64px] max-w-xl grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
                  active ? "text-accent" : "text-ink-3 active:text-ink-2",
                )}
              >
                <Icon className="h-[23px] w-[23px]" strokeWidth={active ? 2.3 : 1.9} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function QuickAddMenu({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (k: "expense" | "income" | "transfer" | "adjustment") => void;
}) {
  const options = [
    { kind: "expense" as const, label: "Add expense", desc: "Bill, purchase or payment", icon: ArrowUpRight, tone: "text-expense" },
    { kind: "income" as const, label: "Add income", desc: "Salary, allowance or other", icon: ArrowDownLeft, tone: "text-income" },
    { kind: "transfer" as const, label: "Transfer", desc: "Move money between accounts", icon: ArrowLeftRight, tone: "text-ink-2" },
    { kind: "adjustment" as const, label: "Adjustment", desc: "Correct your balance", icon: Settings2, tone: "text-ink-2" },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Quick add" size="sm">
      <div className="grid grid-cols-2 gap-3">
        {options.map((o, i) => (
          <button
            key={o.kind}
            type="button"
            data-autofocus={i === 0 ? true : undefined}
            onClick={() => onPick(o.kind)}
            className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-left transition hover:bg-surface-3 active:scale-[0.98]"
          >
            <o.icon className={cn("h-6 w-6", o.tone)} strokeWidth={2.2} />
            <span>
              <span className="block text-[15px] font-semibold">{o.label}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Page header & month switcher
// ---------------------------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  actions,
  showMonth = false,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  showMonth?: boolean;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 pt-2 lg:mb-7">
      <div className="min-w-0">
        {subtitle ? <p className="text-[13px] font-medium text-ink-3">{subtitle}</p> : null}
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {showMonth ? <MonthSwitcher /> : null}
        {actions}
      </div>
    </header>
  );
}

export function MonthSwitcher() {
  const { period, setPeriod } = usePeriod();
  const today = useToday();
  const current = periodOf(today);
  const [picking, setPicking] = useState(false);
  const go = useCallback((d: number) => setPeriod(addMonths(period, d)), [period, setPeriod]);
  return (
    <div className="flex items-center rounded-full border border-line bg-surface p-1 shadow-card">
      <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition hover:bg-surface-3">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="min-w-[112px] rounded-full px-2 text-[14px] font-semibold tracking-[-0.01em]"
        aria-label={`Selected month ${monthLabel(period)}. Choose month`}
      >
        {monthLabel(period, "short")}
        {period === current ? null : <span className="ml-1 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-accent" aria-hidden />}
      </button>
      <button type="button" aria-label="Next month" onClick={() => go(1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition hover:bg-surface-3">
        <ChevronRight className="h-4 w-4" />
      </button>
      <MonthPicker
        open={picking}
        value={period}
        current={current}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPeriod(p);
          setPicking(false);
        }}
      />
    </div>
  );
}

function MonthPicker({
  open,
  value,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  value: string;
  current: string;
  onClose: () => void;
  onPick: (p: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Choose month" size="sm">
      <MonthGrid value={value} current={current} onPick={onPick} />
    </Sheet>
  );
}

function MonthGrid({ value, current, onPick }: { value: string; current: string; onPick: (p: string) => void }) {
  const [year, setYear] = useState(() => +value.slice(0, 4));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <button type="button" aria-label="Previous year" onClick={() => setYear((y) => y - 1)} className="grid h-10 w-10 place-items-center rounded-full bg-surface-3">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[17px] font-semibold tabular">{year}</span>
        <button type="button" aria-label="Next year" onClick={() => setYear((y) => y + 1)} className="grid h-10 w-10 place-items-center rounded-full bg-surface-3">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {months.map((m, i) => {
          const p = `${year}-${String(i + 1).padStart(2, "0")}-01`;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(p)}
              className={cn(
                "h-12 rounded-xl text-[15px] font-semibold transition",
                p === value ? "bg-ink text-inverse" : "bg-surface-2 hover:bg-surface-3",
                p === current && p !== value && "ring-2 ring-accent",
              )}
            >
              {m}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onPick(current)} className="mt-4 w-full rounded-xl py-3 text-[15px] font-semibold text-accent hover:bg-accent-soft">
        Go to this month
      </button>
    </>
  );
}
